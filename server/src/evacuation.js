'use strict';

/**
 * 疏散通行能力计算核心。
 *
 * 网络模型（有向图）：
 *   源点 S -> 房间 i        容量 = 房间待疏散人数
 *   房间/出口 -> 房间/出口   容量 = 通道单批次容量（可多条平行边）
 *   出口 e -> 汇点 T        容量 = 出口容量
 *
 * - 标准最大流天然满足：通道容量由所有房间共享；同一名疏散人员即使跨越多条
 *   通道，在汇点也只被统计一次（流量守恒）。
 * - 「最大可送达人数」即网络最大流；房间的字典序最优送达量用前缀增量最大流
 *   求得（按房间编号顺序逐条加入源点边并持续增广）：
 *   先最大化总送达人数，同量方案再按房间编号顺序优先满足编号靠前的房间。
 *   全部使用整数容量，不存在浮点精度问题。
 * - 封闭某出口时仅删除该出口到汇点的边；通道与其他出口容量保持原值，
 *   因此被封闭的出口仍可作为通道中转节点，但不能作为终点。
 */

/** 房间 / 出口编号排序：纯数字按数值升序，否则按字典序。 */
export function compareId(a, b) {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const da = BigInt(a);
    const db = BigInt(b);
    if (da !== db) return da < db ? -1 : 1;
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Dinic 最大流。 */
class Dinic {
  constructor(n) {
    this.n = n;
    this.g = Array.from({ length: n }, () => []);
  }

  addEdge(u, v, cap) {
    const f = { to: v, cap, rev: this.g[v].length };
    const r = { to: u, cap: 0, rev: this.g[u].length };
    this.g[u].push(f);
    this.g[v].push(r);
    return f;
  }

  maxFlow(s, t, limit = Infinity) {
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

    while (flow < limit) {
      level.fill(-1);
      level[s] = 0;
      const q = [s];
      for (let qi = 0; qi < q.length; qi++) {
        const v = q[qi];
        for (const e of g[v]) {
          if (e.cap > 0 && level[e.to] < 0) {
            level[e.to] = level[v] + 1;
            q.push(e.to);
          }
        }
      }
      if (level[t] < 0) break;
      it.fill(0);
      let pushed;
      while (flow < limit && (pushed = dfs(s, limit - flow)) > 0) {
        flow += pushed;
      }
    }
    return flow;
  }
}

/**
 * 字典序最优的房间送达量（拟阵贪心 / 前缀增量最大流）。
 *
 * 在一张只含通道与出口边的网络上，从「没有任何房间源点边」开始，
 * 按房间编号顺序依次加入边 S→i（容量=人数），每加入一条就在残量网络上
 * 继续增广。记加入房间 i 后的累计最大流为 prefixF[i]，则房间 i 的送达量
 * d_i = prefixF[i] − prefixF[i−1]。
 * 含义：d_i 是在更早房间均已尽量满足之后，房间 i 还能争到的最大增量，
 * 因而向量 (d_0,d_1,…) 在所有总量为 F 的可行送达向量中字典序最大。
 * 返回 { delivery, total }；最终残量网络上的出口边流量可由调用方读取。
 */
function lexicographicDelivery(dinic, rooms, S, T) {
  // 注意：Dinic.maxFlow 返回「本次调用新增」的流量，前缀累计流需自行累加。
  const delivery = [];
  let prefixFlow = 0;
  let prevPrefix = 0;
  rooms.forEach((r, i) => {
    dinic.addEdge(S, i, r.people);
    prefixFlow += dinic.maxFlow(S, T);
    delivery.push(prefixFlow - prevPrefix); // d_i = prefixF[i] − prefixF[i−1]
    prevPrefix = prefixFlow;
  });
  return { delivery, total: prefixFlow };
}

/**
 * 计算并校验一个方案。
 * @param {{name?:string, rooms:Array, exits:Array, passages:Array}} scenario
 *        调用方需保证已通过 validateScenario 校验。
 * @returns 正常情形与逐一封闭每个出口时的送达结果。
 */
export function evaluate(scenario) {
  const rooms = [...scenario.rooms].sort((a, b) => compareId(a.id, b.id));
  const exits = [...scenario.exits].sort((a, b) => compareId(a.id, b.id));
  const passages = scenario.passages;

  const R = rooms.length;
  const E = exits.length;
  if (E === 0) {
    // validateScenario 已拦截，这里做防御性处理。
    throw new Error('方案必须至少包含一个出口');
  }

  const roomIndex = new Map(rooms.map((r, i) => [r.id, i]));
  const exitIndex = new Map(exits.map((e, i) => [e.id, R + i]));
  const nodeOf = (id) => (roomIndex.has(id) ? roomIndex.get(id) : exitIndex.get(id));
  const S = R + E;
  const T = S + 1;
  const N = T + 1;

  /**
   * 孤立房间判定：从「开放且容量大于 0 的出口」出发，沿有向通道反向搜索
   * （只走容量大于 0 的通道）。不可达的房间无法把任何人送达出口，
   * 其全部待疏散人数都计入缺口。封闭出口不作为搜索起点，但其相关通道
   * 仍可被经过（若它能通往其他开放出口）。
   */
  const reverseAdj = new Map();
  for (const p of passages) {
    if (p.capacity === 0) continue;
    if (!reverseAdj.has(p.to)) reverseAdj.set(p.to, []);
    reverseAdj.get(p.to).push(p.from);
  }

  function findIsolatedRooms(closedExitId) {
    const reachable = new Set();
    const queue = [];
    for (const e of exits) {
      if (e.id !== closedExitId && e.capacity > 0) {
        reachable.add(e.id);
        queue.push(e.id);
      }
    }
    while (queue.length > 0) {
      const v = queue.shift();
      for (const u of reverseAdj.get(v) ?? []) {
        if (!reachable.has(u)) {
          reachable.add(u);
          queue.push(u);
        }
      }
    }
    return rooms.filter((r) => !reachable.has(r.id)).map((r) => r.id);
  }

  function solve(closedExitId) {
    const closed = closedExitId ?? null;
    const isolatedSet = new Set(findIsolatedRooms(closed));

    // 通道与开放出口边（不含房间源点边）。
    const dinic = new Dinic(N);
    for (const p of passages) {
      dinic.addEdge(nodeOf(p.from), nodeOf(p.to), p.capacity);
    }
    const sinkEdges = new Map();
    for (const e of exits) {
      if (e.id !== closed && e.capacity > 0) {
        const se = dinic.addEdge(nodeOf(e.id), T, e.capacity);
        sinkEdges.set(e.id, se);
      }
    }

    // 按房间编号顺序逐条加入源点边并持续增广，
    // 得到字典序最优的各房间送达量与总送达人数。
    const { delivery: roomDelivery, total: deliveredTotal } = lexicographicDelivery(
      dinic,
      rooms,
      S,
      T,
    );

    const unmet = [];
    rooms.forEach((r, i) => {
      const got = roomDelivery[i];
      const shortfall = r.people - got;
      if (shortfall > 0) {
        unmet.push({
          roomId: r.id,
          people: r.people,
          delivered: got,
          shortfall,
          isolated: isolatedSet.has(r.id),
        });
      }
    });

    const exitUsage = exits.map((e) => {
      const edge = sinkEdges.get(e.id);
      return {
        exitId: e.id,
        capacity: e.capacity,
        used: edge ? e.capacity - edge.cap : 0,
        closed: e.id === closed,
      };
    });

    return {
      closedExitId: closed,
      delivered: deliveredTotal,
      gap: rooms.reduce((sum, r) => sum + r.people, 0) - deliveredTotal,
      unmet,
      isolatedRooms: rooms.map((r) => r.id).filter((id) => isolatedSet.has(id)),
      exitUsage,
    };
  }

  const totalPeople = rooms.reduce((sum, r) => sum + r.people, 0);
  return {
    totalPeople,
    roomOrder: rooms.map((r) => r.id),
    normal: solve(null),
    exitClosures: exits.map((e) => solve(e.id)),
  };
}

