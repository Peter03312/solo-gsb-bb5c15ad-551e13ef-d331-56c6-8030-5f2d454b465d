'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compareId } from '../src/evacuation.js';
import { validateScenario } from '../src/validation.js';

// 便捷函数：从 normal.unmet 推出每个房间送达量
function deliveredByRoom(result, scenario, closureIndex = null) {
  const sol = closureIndex === null ? result.normal : result.exitClosures[closureIndex];
  const map = new Map(scenario.rooms.map((r) => [r.id, r.people]));
  for (const u of sol.unmet) map.set(u.roomId, u.delivered);
  return map;
}

test('compareId 数字按数值、其余按字典序', () => {
  assert.deepEqual(['10', '2', '1', 'A'].sort(compareId), ['1', '2', '10', 'A']);
});

test('示例方案：正常 / 封闭 E1 / 封闭 E2 的总量与字典序分配', () => {
  const scenario = {
    rooms: [
      { id: 'R1', people: 120 },
      { id: 'R2', people: 80 },
      { id: 'R3', people: 60 },
      { id: 'R4', people: 30 },
    ],
    exits: [
      { id: 'E1', capacity: 120 },
      { id: 'E2', capacity: 80 },
    ],
    passages: [
      { from: 'R1', to: 'E1', capacity: 50 },
      { from: 'R2', to: 'E1', capacity: 100 },
      { from: 'R3', to: 'E2', capacity: 60 },
      { from: 'R2', to: 'R3', capacity: 30 },
    ],
  };
  const r = evaluate(scenario);

  // R1→E1 通道仅 50，故 R1 最多送达 50；E1 余 70 由 R2 直送（R2 再剩 10 人
  // 借道 R2→R3→E2）；R3→E2 通道 60 中 R2 中转 10、R3 自身 50。
  // 最大送达 180，缺口 110（含孤立 R4 的 30）。
  assert.equal(r.normal.delivered, 180);
  assert.equal(r.normal.gap, 110);
  let d = deliveredByRoom(r, scenario);
  assert.deepEqual(Object.fromEntries(d), { R1: 50, R2: 80, R3: 50, R4: 0 });
  assert.deepEqual(r.normal.isolatedRooms, ['R4']);
  const r4 = r.normal.unmet.find((u) => u.roomId === 'R4');
  assert.equal(r4.isolated, true);
  assert.equal(r4.shortfall, 30);

  // 封闭 E1：只剩 E2。R1/R4 不可达任何开放出口（孤立）；
  // R2 经 R2→R3(30) 中转 30，R3→E2(60) 再容纳 R3 自身 30，共 60。
  // 编号靠前的 R2 在共享瓶颈上优先拿满 30。
  const c1 = r.exitClosures.find((x) => x.closedExitId === 'E1');
  assert.equal(c1.delivered, 60);
  assert.equal(c1.gap, 230);
  assert.deepEqual(c1.isolatedRooms.sort(compareId), ['R1', 'R4']);
  d = new Map();
  c1.unmet.forEach((u) => d.set(u.roomId, u.delivered));
  assert.equal(d.get('R2'), 30);
  assert.equal(d.get('R3'), 30);
  const e1Usage = c1.exitUsage.find((x) => x.exitId === 'E1');
  assert.equal(e1Usage.closed, true);
  assert.equal(e1Usage.used, 0);

  // 封闭 E2：只剩 E1，收 120（R1 50 + R2 70）；缺口 170（R3/R4 无法到 E1）
  const c2 = r.exitClosures.find((x) => x.closedExitId === 'E2');
  assert.equal(c2.delivered, 120);
  assert.equal(c2.gap, 170);
  assert.deepEqual(c2.isolatedRooms.sort(compareId), ['R3', 'R4']);
});

test('通道容量由多房间共享，且一人跨多通道只计一次', () => {
  const scenario = {
    rooms: [
      { id: '1', people: 100 },
      { id: '2', people: 100 },
    ],
    exits: [{ id: 'X', capacity: 1000 }],
    // 两个房间都汇聚到唯一的瓶颈通道 C（容量 50）
    passages: [
      { from: '1', to: '2', capacity: 1000 },
      { from: '2', to: 'X', capacity: 50 },
    ],
  };
  const r = evaluate(scenario);
  assert.equal(r.normal.delivered, 50);
  assert.equal(r.normal.gap, 150);
  // 编号 1 优先：房间 1 拿走 50
  const map = new Map(r.normal.unmet.map((u) => [u.roomId, u.delivered]));
  assert.equal(map.get('1'), 50);
  assert.equal(map.get('2'), 0);
});

test('封闭出口仍可作为通道中转，但不能作为终点', () => {
  const scenario = {
    rooms: [{ id: 'R', people: 10 }],
    exits: [
      { id: 'EA', capacity: 0 }, // 容量 0，等同封闭终点能力
      { id: 'EB', capacity: 10 },
    ],
    passages: [
      { from: 'R', to: 'EA', capacity: 10 },
      { from: 'EA', to: 'EB', capacity: 10 },
    ],
  };
  const r = evaluate(scenario);
  // 正常：EA 容量为 0，不能送达 EA，但经 EA 中转运到 EB 的 10 人可以送达
  assert.equal(r.normal.delivered, 10);
  // 封闭 EB：EA 容量本来就是 0，送达为 0，R 为孤立（开放且容量>0 的出口不存在）
  const cEB = r.exitClosures.find((x) => x.closedExitId === 'EB');
  assert.equal(cEB.delivered, 0);
  assert.deepEqual(cEB.isolatedRooms, ['R']);
  // 封闭 EA：通道保留，R→EA→EB 仍可走，送达 10
  const cEA = r.exitClosures.find((x) => x.closedExitId === 'EA');
  assert.equal(cEA.delivered, 10);
});

test('平行通道容量叠加', () => {
  const scenario = {
    rooms: [{ id: 'R', people: 100 }],
    exits: [{ id: 'X', capacity: 100 }],
    passages: [
      { from: 'R', to: 'X', capacity: 30 },
      { from: 'R', to: 'X', capacity: 45 },
    ],
  };
  assert.equal(evaluate(scenario).normal.delivered, 75);
});

test('校验：负人数、负容量、不存在端点、无出口分别拒绝并说明原因', () => {
  const base = {
    rooms: [{ id: 'R1', people: 10 }],
    exits: [{ id: 'E1', capacity: 5 }],
    passages: [{ from: 'R1', to: 'E1', capacity: 5 }],
  };

  let v = validateScenario({ ...base, rooms: [{ id: 'R1', people: -3 }] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join('；'), /负数/);

  v = validateScenario({ ...base, passages: [{ from: 'R1', to: 'E1', capacity: -1 }] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join('；'), /负数/);

  v = validateScenario({ ...base, passages: [{ from: 'GHOST', to: 'E1', capacity: 5 }] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join('；'), /不存在/);

  v = validateScenario({ ...base, passages: [{ from: 'R1', to: 'NOWHERE', capacity: 5 }] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join('；'), /不存在/);

  v = validateScenario({ rooms: base.rooms, exits: [], passages: [] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join('；'), /出口/);

  v = validateScenario(base);
  assert.equal(v.ok, true);
});

test('校验：重复编号 / 房间出口同名 / 自环 / 非整数', () => {
  let v = validateScenario({
    rooms: [
      { id: 'A', people: 1 },
      { id: 'A', people: 2 },
    ],
    exits: [{ id: 'E', capacity: 1 }],
    passages: [],
  });
  assert.equal(v.ok, false);
  assert.match(v.errors.join('；'), /重复/);

  v = validateScenario({
    rooms: [{ id: 'A', people: 1 }],
    exits: [{ id: 'A', capacity: 1 }],
    passages: [],
  });
  assert.equal(v.ok, false);
  assert.match(v.errors.join('；'), /全局唯一/);

  v = validateScenario({
    rooms: [{ id: 'A', people: 1 }],
    exits: [{ id: 'E', capacity: 1 }],
    passages: [{ from: 'A', to: 'A', capacity: 1 }],
  });
  assert.equal(v.ok, false);
  assert.match(v.errors.join('；'), /自环/);

  v = validateScenario({
    rooms: [{ id: 'A', people: 1.5 }],
    exits: [{ id: 'E', capacity: 1 }],
    passages: [],
  });
  assert.equal(v.ok, false);
});
