'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compareId } from '../src/evacuation.js';

// 直接复用内部的 Dinic 需要导出；为保持核心模块导出精简，这里用最小克隆做交叉验证。
class Dinic {
  constructor(n) {
    this.n = n;
    this.g = Array.from({ length: n }, () => []);
  }
  addEdge(u, v, cap) {
    this.g[u].push({ to: v, cap, rev: this.g[v].length });
    this.g[v].push({ to: u, cap: 0, rev: this.g[u].length - 1 });
  }
  maxFlow(s, t) {
    const { n, g } = this;
    const level = new Array(n).fill(-1);
    const it = new Array(n).fill(0);
    let flow = 0;
    const dfs = (v, pushed) => {
      if (v === t) return pushed;
      for (let i = it[v]; i < g[v].length; i++) {
        it[v] = i;
        const e = g[v][i];
        if (e.cap > 0 && level[e.to] === level[v] + 1) {
          const tr = dfs(e.to, Math.min(pushed, e.cap));
          if (tr > 0) {
            e.cap -= tr;
            g[e.to][e.rev].cap += tr;
            return tr;
          }
        }
      }
      return 0;
    };
    for (;;) {
      level.fill(-1);
      level[s] = 0;
      const q = [s];
      for (let qi = 0; qi < q.length; qi++) {
        for (const e of g[q[qi]]) {
          if (e.cap > 0 && level[e.to] < 0) {
            level[e.to] = level[q[qi]] + 1;
            q.push(e.to);
          }
        }
      }
      if (level[t] < 0) break;
      it.fill(0);
      let pushed;
      while ((pushed = dfs(s, Infinity)) > 0) flow += pushed;
    }
    return flow;
  }
}

// 独立用纯 Dinic 求「只开放给定房间集合」时的最大送达人数
function prefixMaxFlow(scenario, prefixIds) {
  const rooms = [...scenario.rooms].sort((a, b) => compareId(a.id, b.id));
  const exits = scenario.exits;
  const idNode = new Map();
  rooms.forEach((r, i) => idNode.set(r.id, i));
  exits.forEach((e, i) => idNode.set(e.id, rooms.length + i));
  const S = rooms.length + exits.length;
  const T = S + 1;
  const dinic = new Dinic(T + 1);
  const prefix = new Set(prefixIds);
  for (const r of rooms) {
    if (prefix.has(r.id)) dinic.addEdge(S, idNode.get(r.id), r.people);
  }
  for (const p of scenario.passages) dinic.addEdge(idNode.get(p.from), idNode.get(p.to), p.capacity);
  for (const e of exits) dinic.addEdge(idNode.get(e.id), T, e.capacity);
  return dinic.maxFlow(S, T);
}

// 简单可复现的伪随机
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('随机属性：字典序最优解的每个房间前缀送达量 = 仅开放该前缀时的最大流', () => {
  const rand = mulberry32(20260930);
  for (let iter = 0; iter < 300; iter++) {
    const R = 2 + Math.floor(rand() * 5);
    const E = 1 + Math.floor(rand() * 3);
    const rooms = Array.from({ length: R }, (_, i) => ({
      id: String(i + 1),
      people: Math.floor(rand() * 18),
    }));
    const exits = Array.from({ length: E }, (_, i) => ({
      id: 'E' + (i + 1),
      capacity: Math.floor(rand() * 25),
    }));
    const nodeIds = [...rooms.map((r) => r.id), ...exits.map((e) => e.id)];
    const passages = [];
    const edgeCount = Math.floor(rand() * (R + E) * 2);
    for (let k = 0; k < edgeCount; k++) {
      const a = nodeIds[Math.floor(rand() * nodeIds.length)];
      const b = nodeIds[Math.floor(rand() * nodeIds.length)];
      if (a === b) continue;
      // 偏向从房间编号小/出口编号小的方向连边，使图更可能连通
      passages.push({ from: a, to: b, capacity: Math.floor(rand() * 20) });
    }
    const scenario = { rooms, exits, passages };
    const result = evaluate(scenario);

    // 送达向量
    const delivered = new Map(rooms.map((r) => [r.id, r.people]));
    for (const u of result.normal.unmet) delivered.set(u.roomId, u.delivered);
    const ordered = [...rooms].sort((a, b) => compareId(a.id, b.id));
    let sum = 0;
    const prefix = [];
    for (const r of ordered) {
      prefix.push(r.id);
      sum += delivered.get(r.id);
      // 字典序最优基性质：前缀累计送达量恰为该前缀的可达最大流
      assert.equal(
        sum,
        prefixMaxFlow(scenario, prefix),
        `iter=${iter} 前缀 [${prefix.join(',')}] 不满足字典序最优（房间=${JSON.stringify(rooms)}, 出口=${JSON.stringify(exits)}, 通道=${JSON.stringify(passages)}）`,
      );
      // 单项合法性
      assert.ok(delivered.get(r.id) >= 0 && delivered.get(r.id) <= r.people);
    }
    assert.equal(sum, result.normal.delivered);

    // 每个封闭情景同样满足总量合法性
    for (const c of result.exitClosures) {
      assert.ok(c.delivered <= result.normal.delivered);
      assert.equal(c.gap, result.totalPeople - c.delivered);
    }
  }
});
