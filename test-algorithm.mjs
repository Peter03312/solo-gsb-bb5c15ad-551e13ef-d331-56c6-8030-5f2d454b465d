import { analyzePlan } from './server/evacuation.js';
import { validatePlan, ValidationError } from './server/validation.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ FAIL:', msg);
  }
}

function run(label, fn) {
  try {
    fn();
    console.log('✓', label);
  } catch (e) {
    failed++;
    console.error('✗', label, '->', e.message);
  }
}

// 1. 简单线性网络：A(10人)->B 容量6 ->出口10
run('线性网络：瓶颈在通道', () => {
  const plan = {
    id: 1,
    name: 't',
    rooms: [
      { code: 'A', occupants: 10 },
      { code: 'B', occupants: 0 },
    ],
    passages: [{ from_code: 'A', to_code: 'B', kind: 'passage', capacity: 6 }],
    exits: [{ code: 'E', room_code: 'B', capacity: 10 }],
  };
  const r = analyzePlan(plan).normal;
  assert(r.delivered === 6, `delivered=${r.delivered} want 6`);
  assert(r.gap === 4, `gap=${r.gap} want 4`);
  assert(r.unmet_rooms.length === 1 && r.unmet_rooms[0].code === 'A', 'A 未满足');
  assert(r.rooms.find((x) => x.code === 'A').evacuated === 6, 'A 送达 6');
});

// 2. 孤立房间计入缺口
run('孤立房间计入缺口', () => {
  const plan = {
    id: 1,
    name: 't',
    rooms: [
      { code: 'A', occupants: 5 },
      { code: 'I', occupants: 7 },
    ],
    passages: [],
    exits: [{ code: 'E', room_code: 'A', capacity: 10 }],
  };
  const r = analyzePlan(plan).normal;
  assert(r.delivered === 5, `delivered=${r.delivered} want 5`);
  assert(r.gap === 7, `gap=${r.gap} want 7`);
  assert(r.unmet_rooms.map((x) => x.code).join() === 'I', '只有 I 未满足');
});

// 3. lex 优先级：两个房间共享单出口容量10；B 有直达，A 经 B
//    总量最大=10；同总量下 A 优先（A<B），应 A=10, B=0
run('lex 优先级：编号靠前的房间借走后续房间的额度', () => {
  const plan = {
    id: 1,
    name: 't',
    rooms: [
      { code: 'A', occupants: 10 },
      { code: 'B', occupants: 10 },
    ],
    passages: [{ from_code: 'A', to_code: 'B', kind: 'door', capacity: 10 }],
    exits: [{ code: 'E', room_code: 'B', capacity: 10 }],
  };
  const r = analyzePlan(plan).normal;
  assert(r.delivered === 10, `delivered=${r.delivered} want 10`);
  const a = r.rooms.find((x) => x.code === 'A').evacuated;
  const b = r.rooms.find((x) => x.code === 'B').evacuated;
  assert(a === 10 && b === 0, `A=${a},B=${b} want A=10,B=0`);
});

// 4. 顺序反过来：R2 先建（插入顺序不影响编号排序），R1 仍优先
run('lex 自然序：R1,R2,R10', () => {
  const plan = {
    id: 1,
    name: 't',
    rooms: [
      { code: 'R10', occupants: 10 },
      { code: 'R2', occupants: 10 },
      { code: 'R1', occupants: 10 },
    ],
    passages: [
      { from_code: 'R1', to_code: 'R10', kind: 'passage', capacity: 10 },
      { from_code: 'R2', to_code: 'R10', kind: 'passage', capacity: 10 },
    ],
    exits: [{ code: 'E', room_code: 'R10', capacity: 25 }],
  };
  const r = analyzePlan(plan).normal;
  // 总可达 25，全部 R1(10)+R2(10)+R10(5)
  const m = Object.fromEntries(r.rooms.map((x) => [x.code, x.evacuated]));
  assert(r.delivered === 25, `delivered=${r.delivered} want 25`);
  assert(m.R1 === 10 && m.R2 === 10 && m.R10 === 5, `R1=${m.R1},R2=${m.R2},R10=${m.R10}`);
});

// 5. 封闭出口：两出口，封闭一个后送达相应减少
run('封闭出口不作为终点，其余容量不变', () => {
  const plan = {
    id: 1,
    name: 't',
    rooms: [{ code: 'A', occupants: 100 }],
    passages: [],
    exits: [
      { code: 'E1', room_code: 'A', capacity: 30 },
      { code: 'E2', room_code: 'A', capacity: 20 },
    ],
  };
  const a = analyzePlan(plan);
  assert(a.normal.delivered === 50, `normal=${a.normal.delivered} want 50`);
  const c1 = a.closures.find((c) => c.closed_exit === 'E1');
  const c2 = a.closures.find((c) => c.closed_exit === 'E2');
  assert(c1.delivered === 20, `close E1 -> ${c1.delivered} want 20`);
  assert(c2.delivered === 30, `close E2 -> ${c2.delivered} want 30`);
  assert(
    c1.exit_usage.find((e) => e.code === 'E1').closed === true &&
      c1.exit_usage.find((e) => e.code === 'E1').used === 0,
    '封闭出口用量为0且标记closed'
  );
});

// 6. 同一人跨多通道只计一次（流守恒，送达=出口侧统计）
run('同一人跨多条通道只计一次', () => {
  const plan = {
    id: 1,
    name: 't',
    rooms: [
      { code: 'A', occupants: 10 },
      { code: 'B', occupants: 0 },
      { code: 'C', occupants: 0 },
    ],
    passages: [
      { from_code: 'A', to_code: 'B', kind: 'passage', capacity: 10 },
      { from_code: 'B', to_code: 'C', kind: 'passage', capacity: 10 },
    ],
    exits: [{ code: 'E', room_code: 'C', capacity: 10 }],
  };
  const r = analyzePlan(plan).normal;
  const totalPassage = r.passage_flows.reduce((s, p) => s + p.used, 0);
  assert(totalPassage === 20, '两条通道各 10（中间流量）');
  assert(r.delivered === 10 && r.rooms.find((x) => x.code === 'A').evacuated === 10,
    '送达只有 10 人，不重复计数');
});

// 7. 循环通道不产生虚增
run('有向循环不会虚增送达', () => {
  const plan = {
    id: 1,
    name: 't',
    rooms: [
      { code: 'A', occupants: 5 },
      { code: 'B', occupants: 5 },
    ],
    passages: [
      { from_code: 'A', to_code: 'B', kind: 'passage', capacity: 100 },
      { from_code: 'B', to_code: 'A', kind: 'passage', capacity: 100 },
    ],
    exits: [{ code: 'E', room_code: 'A', capacity: 100 }],
  };
  const r = analyzePlan(plan).normal;
  assert(r.delivered === 10, `delivered=${r.delivered} want 10`);
});

// ---- 校验类 ----
run('拒绝：不存在的房间端点', () => {
  try {
    validatePlan({
      name: 'x',
      rooms: [{ code: 'A', occupants: 1 }],
      passages: [{ from_code: 'A', to_code: 'X', capacity: 1 }],
      exits: [{ code: 'E', room_code: 'A', capacity: 1 }],
    });
    assert(false, '应抛错');
  } catch (e) {
    assert(e instanceof ValidationError && /不存在/.test(e.message), e.message);
  }
});

run('拒绝：出口引用不存在的房间', () => {
  try {
    validatePlan({
      name: 'x',
      rooms: [{ code: 'A', occupants: 1 }],
      passages: [],
      exits: [{ code: 'E', room_code: 'Z', capacity: 1 }],
    });
    assert(false, '应抛错');
  } catch (e) {
    assert(/不存在/.test(e.message), e.message);
  }
});

run('拒绝：负人数 / 负容量', () => {
  const cases = [
    { rooms: [{ code: 'A', occupants: -1 }], exits: [{ code: 'E', room_code: 'A', capacity: 1 }] },
    { rooms: [{ code: 'A', occupants: 1 }], passages: [{ from_code: 'A', to_code: 'A', capacity: -2 }], exits: [{ code: 'E', room_code: 'A', capacity: 1 }] },
    { rooms: [{ code: 'A', occupants: 1 }], exits: [{ code: 'E', room_code: 'A', capacity: -3 }] },
  ];
  for (const c of cases) {
    try {
      validatePlan({ name: 'x', passages: [], ...c });
      assert(false, '应抛错');
    } catch (e) {
      assert(/负数|不能为负/.test(e.message), e.message);
    }
  }
});

run('拒绝：没有出口', () => {
  try {
    validatePlan({
      name: 'x',
      rooms: [{ code: 'A', occupants: 1 }],
      passages: [],
      exits: [],
    });
    assert(false, '应抛错');
  } catch (e) {
    assert(/出口/.test(e.message), e.message);
  }
});

run('拒绝：房间编号重复 / 出口编号重复', () => {
  try {
    validatePlan({
      name: 'x',
      rooms: [
        { code: 'A', occupants: 1 },
        { code: 'A', occupants: 2 },
      ],
      passages: [],
      exits: [{ code: 'E', room_code: 'A', capacity: 1 }],
    });
    assert(false, '应抛错');
  } catch (e) {
    assert(/重复/.test(e.message), e.message);
  }
});

run('零容量通道/出口允许；全零出口拒绝', () => {
  const v = validatePlan({
    name: 'ok',
    rooms: [{ code: 'A', occupants: 1 }],
    passages: [{ from_code: 'A', to_code: 'A', capacity: 0 }],
    exits: [
      { code: 'E1', room_code: 'A', capacity: 0 },
      { code: 'E2', room_code: 'A', capacity: 5 },
    ],
  });
  assert(v.name === 'ok', '零容量合法');
  try {
    validatePlan({
      name: 'bad',
      rooms: [{ code: 'A', occupants: 1 }],
      passages: [],
      exits: [{ code: 'E', room_code: 'A', capacity: 0 }],
    });
    assert(false, '应抛错');
  } catch (e) {
    assert(/容量均为 0/.test(e.message), e.message);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
