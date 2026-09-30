// 差分测试：用独立的最小费用最大流（BigInt 权重）验证 lexicographic 重路由。
// 思路：给 S->房间i 的边赋费用 -M^(n-1-i)（M > 总人数，保证不进位），
//       总费用最小 <=> 按房间顺序送达人数的向量字典序最大。
import { analyzePlan } from './server/evacuation.js';

function mcmfLex(plan, closedExit) {
  const rooms = plan.rooms;
  const idx = new Map(rooms.map((r, i) => [r.code, i]));
  const N = rooms.length;
  const S = N, T = N + 1;
  const n = N + 2;
  const g = Array.from({ length: n }, () => []);
  const add = (a, b, cap, cost = 0n) => {
    const e = { to: b, cap: BigInt(cap), cost, flow: 0n };
    const r = { to: a, cap: 0n, cost: -cost, flow: 0n };
    g[a].push(e); g[b].push(r);
    e.rev = g[b].length - 1; r.rev = g[a].length - 1;
    return e;
  };
  const total = rooms.reduce((s, r) => s + r.occupants, 0);
  const M = BigInt(total + 1);
  const order = rooms.map((r) => r.code).sort();
  const rankOf = new Map(order.map((c, k) => [c, k]));
  // 源边费用：-M^(n-1-rank)，费用和最小 <=> 送达向量按编号顺序字典序最大
  const srcEdges = rooms.map((r) =>
    add(S, idx.get(r.code), r.occupants, -(M ** BigInt(N - 1 - rankOf.get(r.code))))
  );
  for (const p of plan.passages) add(idx.get(p.from_code), idx.get(p.to_code), p.capacity);
  for (const e of plan.exits) {
    if (e.code !== closedExit) add(idx.get(e.room_code), T, e.capacity);
  }

  // SPFA 最小费用增广
  let totalFlow = 0n;
  for (;;) {
    const dist = Array(n).fill(null);
    const prevV = Array(n).fill(-1);
    const prevE = Array(n).fill(-1);
    const inQ = Array(n).fill(false);
    dist[S] = 0n;
    const q = [S];
    let qh = 0;
    while (qh < q.length) {
      const v = q[qh++];
      inQ[v] = false;
      g[v].forEach((e, ei) => {
        if (e.cap > 0n && (dist[e.to] === null || dist[v] + e.cost < dist[e.to])) {
          dist[e.to] = dist[v] + e.cost;
          prevV[e.to] = v; prevE[e.to] = ei;
          if (!inQ[e.to]) { inQ[e.to] = true; q.push(e.to); }
        }
      });
    }
    if (dist[T] === null) break;
    let f = null;
    for (let v = T; v !== S; v = prevV[v]) {
      const e = g[prevV[v]][prevE[v]];
      f = f === null ? e.cap : (e.cap < f ? e.cap : f);
    }
    for (let v = T; v !== S; v = prevV[v]) {
      const e = g[prevV[v]][prevE[v]];
      e.cap -= f; g[v][e.rev].cap += f;
    }
    totalFlow += f;
  }
  return rooms.map((r) => {
    const e = srcEdges[idx.get(r.code)];
    return [r.code, Number(BigInt(r.occupants) - e.cap)];
  });
}

function rand(n) { return Math.floor(Math.random() * n); }

const TRIALS = 400;
let fails = 0;
for (let t = 0; t < TRIALS; t++) {
  const n = 2 + rand(5);
  const codes = Array.from({ length: n }, (_, i) => 'R' + (i + 1));
  const rooms = codes.map((c) => ({ code: c, occupants: rand(12) }));
  const passages = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && Math.random() < 0.28) {
        passages.push({ from_code: codes[i], to_code: codes[j], kind: 'passage', capacity: rand(10) });
      }
    }
  }
  const exits = [];
  const exitCount = 1 + rand(2);
  const used = new Set();
  for (let k = 0; k < exitCount; k++) {
    let c = codes[rand(n)];
    let guard = 0;
    while (used.has(c) && guard++ < 10) c = codes[rand(n)];
    used.add(c);
    exits.push({ code: 'E' + k, room_code: c, capacity: rand(15) });
  }
  const plan = { id: 1, name: 'rand', rooms, passages, exits };
  const mine = analyzePlan(plan).normal;
  const mineVec = mine.rooms.map((r) => [r.code, r.evacuated]);
  const refVec = mcmfLex(plan, null);
  const a = new Map(mineVec), b = new Map(refVec);
  const same = codes.every((c) => a.get(c) === b.get(c));
  if (!same) {
    fails++;
    if (fails <= 5) {
      console.error('MISMATCH', JSON.stringify(plan));
      console.error(' mine:', mineVec, 'ref:', refVec, 'total mine:', mine.delivered);
    }
  }
  // 封闭场景也抽查
  if (Math.random() < 0.5) {
    const closed = exits[rand(exits.length)].code;
    const mc = analyzePlan(plan).closures.find((x) => x.closed_exit === closed);
    const mineC = mc.rooms.map((r) => [r.code, r.evacuated]);
    const refC = mcmfLex(plan, closed);
    const am = new Map(mineC), bm = new Map(refC);
    if (!codes.every((c) => am.get(c) === bm.get(c))) {
      fails++;
      if (fails <= 5) {
        console.error('MISMATCH(close ' + closed + ')', JSON.stringify(plan));
        console.error(' mine:', mineC, 'ref:', refC);
      }
    }
  }
}
console.log(fails === 0 ? `${TRIALS} 个随机网络（含封闭出口场景）全部与独立最小费用流结果一致 ✓` : `${fails} 个不一致 ✗`);
process.exit(fails ? 1 : 0);
