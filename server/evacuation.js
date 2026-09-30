import { Dinic } from './dinic.js';

// 房间编号排序：数字部分按数值比较，其余按本地化字符串比较
// 例如：R1, R2, R10（而不是 R1, R10, R2）
function naturalCompare(a, b) {
  const re = /(\d+|\D+)/g;
  const pa = a.match(re) || [];
  const pb = b.match(re) || [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]);
    const nb = /^\d+$/.test(pb[i]);
    if (na && nb) {
      const d = Number(pa[i]) - Number(pb[i]);
      if (d !== 0) return d;
    } else if (pa[i] !== pb[i]) {
      return pa[i].localeCompare(pb[i], 'zh-Hans-CN');
    }
  }
  return 0;
}

/**
 * 计算单个场景的疏散结果。
 *
 * 网络模型：
 *   超级源点 S → 房间 i        容量 = 该房间待疏散人数
 *   房间 a → 房间 b            容量 = 门/通道单批次容量（各房间共享，人流自然只计一次）
 *   房间 i → 超级汇点 T        容量 = 该房间所接出口的容量
 *   最大流值 = 最大可送达人数。
 *
 * 优先级：先最大化总送达人数；同总量下按房间编号顺序（自然序）优先满足。
 * 做法：先求 S→T 最大流，然后按编号顺序逐个房间，在残量网上从该房间向 S 增广，
 * 增广路径只能借走“后续房间”已占用的源边流量（先前房间的源边反向残量被锁为 0），
 * 从而在不改变总流量的前提下把送达额度重路由给编号更靠前的房间。
 *
 * @param {object} plan 已通过校验的方案
 * @param {string|null} closedExitCode 被封闭的出口编号；封闭出口不作为终点
 */
function solveScenario(plan, closedExitCode) {
  const rooms = plan.rooms;
  const roomIndex = new Map(rooms.map((r, i) => [r.code, i]));
  const N = rooms.length;
  const S = N;
  const T = N + 1;
  const dinic = new Dinic(N + 2);

  // S → 房间
  const sourceEdges = rooms.map((r) =>
    dinic.addEdge(S, roomIndex.get(r.code), r.occupants)
  );

  // 通道/门（有向）
  const passageEdges = plan.passages.map((p) => ({
    ref: dinic.addEdge(roomIndex.get(p.from_code), roomIndex.get(p.to_code), p.capacity),
    from_code: p.from_code,
    to_code: p.to_code,
    kind: p.kind,
    capacity: p.capacity,
  }));

  // 出口（封闭出口直接不建边，不能作为终点；其余容量保持原值）
  const exitEdges = plan.exits
    .filter((e) => e.code !== closedExitCode)
    .map((e) => ({
      code: e.code,
      room_code: e.room_code,
      capacity: e.capacity,
      ref: dinic.addEdge(roomIndex.get(e.room_code), T, e.capacity),
    }));

  // 第一步：总送达人数最大化
  const delivered = dinic.maxFlow(S, T);

  // 第二步：同总量下按房间编号顺序优先满足
  const order = rooms
    .map((r) => ({ code: r.code, idx: roomIndex.get(r.code) }))
    .sort((a, b) => naturalCompare(a.code, b.code));

  for (const { code, idx } of order) {
    const edge = sourceEdges[idx];
    const reverseEdge = dinic.g[idx][edge.rev];
    const already = reverseEdge.cap;           // 当前该房间已送达人数
    const remaining = edge.cap;                // 源边剩余容量
    if (remaining <= 0) {
      reverseEdge.cap = 0;                     // 已满载：锁定，禁止后续房间借走
      continue;
    }
    // 禁止增广路径直接沿本房间源边的反向边回到 S（那只会减少本房间流量）
    reverseEdge.cap = 0;
    const gained = dinic.maxFlow(idx, S, remaining);
    edge.cap -= gained;                        // 本房间源边流量增加 gained
    // 保持 reverseEdge.cap = 0：锁定该房间已取得的额度，优先级更低的房间不能再借走
    if (gained === 0 && already === 0) {
      // 孤立或无法获得更多额度：无可重路由资源
    }
  }

  const roomResults = rooms.map((r, i) => {
    const edge = sourceEdges[i];
    const evacuated = edge.originalCap - edge.cap;
    return {
      code: r.code,
      occupants: r.occupants,
      evacuated,
      shortfall: r.occupants - evacuated,
      unmet: evacuated < r.occupants,
    };
  });

  const exitUsage = exitEdges.map((e) => ({
    code: e.code,
    room_code: e.room_code,
    capacity: e.capacity,
    used: e.ref.originalCap - e.ref.cap,
  }));

  // 封闭出口也出现在用量列表中，明确为 0
  if (closedExitCode) {
    const closed = plan.exits.find((e) => e.code === closedExitCode);
    exitUsage.push({
      code: closed.code,
      room_code: closed.room_code,
      capacity: closed.capacity,
      used: 0,
      closed: true,
    });
    exitUsage.sort((a, b) => naturalCompare(a.code, b.code));
  }

  const passageFlows = passageEdges.map((p) => ({
    from_code: p.from_code,
    to_code: p.to_code,
    kind: p.kind,
    capacity: p.capacity,
    used: p.ref.originalCap - p.ref.cap,
  }));

  const demand = rooms.reduce((s, r) => s + r.occupants, 0);
  const unmetRooms = roomResults
    .filter((r) => r.unmet)
    .sort((a, b) => naturalCompare(a.code, b.code));

  return {
    closed_exit: closedExitCode,
    demand,
    delivered,
    gap: demand - delivered,
    all_satisfied: delivered === demand,
    rooms: roomResults,
    unmet_rooms: unmetRooms,
    exit_usage: exitUsage,
    passage_flows: passageFlows,
  };
}

export function analyzePlan(plan) {
  const normal = solveScenario(plan, null);
  const closures = plan.exits.map((e) => solveScenario(plan, e.code));
  return {
    plan: {
      id: plan.id,
      name: plan.name,
    },
    normal,
    closures,
  };
}

export { naturalCompare };
