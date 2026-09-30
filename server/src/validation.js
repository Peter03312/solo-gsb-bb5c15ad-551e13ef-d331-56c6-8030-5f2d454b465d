'use strict';

/**
 * 方案录入校验。
 * 拒绝条件（需求明确要求）：
 *  - 引用不存在的房间或通道端点
 *  - 负人数 / 负容量
 *  - 没有出口的方案
 * 另对非整数、空编号、重复编号、类型错误等一并给出明确原因。
 * 校验通过时返回 { ok:true, scenario }，否则返回 { ok:false, errors:[...] }。
 */

const MAX_NUMBER = 1_000_000_000;

function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

function nonEmptyId(v) {
  return (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '';
}

export function validateScenario(payload) {
  const errors = [];

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['请求体必须是一个方案对象（JSON）。'] };
  }

  const name = payload.name === undefined ? '' : String(payload.name).slice(0, 100);

  const roomsRaw = payload.rooms;
  const exitsRaw = payload.exits;
  const passagesRaw = payload.passages;

  if (!Array.isArray(roomsRaw)) errors.push('rooms 必须是房间数组。');
  if (!Array.isArray(exitsRaw)) errors.push('exits 必须是出口数组。');
  if (!Array.isArray(passagesRaw)) errors.push('passages 必须是通道数组。');

  if (errors.length > 0) return { ok: false, errors };

  const rooms = [];
  const roomIds = new Set();
  roomsRaw.forEach((room, i) => {
    const where = `第 ${i + 1} 个房间`;
    if (room === null || typeof room !== 'object' || Array.isArray(room)) {
      errors.push(`${where}：必须是对象。`);
      return;
    }
    if (!nonEmptyId(room.id)) {
      errors.push(`${where}：编号 id 不能为空。`);
      return;
    }
    const id = String(room.id).trim();
    if (roomIds.has(id)) {
      errors.push(`${where}：房间编号 "${id}" 重复。`);
      return;
    }
    if (!isInt(room.people)) {
      errors.push(`${where}(编号 "${id}")：待疏散人数必须是非负整数。`);
    } else if (room.people < 0) {
      errors.push(`${where}(编号 "${id}")：待疏散人数不能为负数（收到 ${room.people}）。`);
    } else if (room.people > MAX_NUMBER) {
      errors.push(`${where}(编号 "${id}")：待疏散人数超出上限 ${MAX_NUMBER}。`);
    }
    roomIds.add(id);
    rooms.push({ id, name: room.name === undefined ? '' : String(room.name).slice(0, 100), people: room.people });
  });

  const exits = [];
  const exitIds = new Set();
  exitsRaw.forEach((exit, i) => {
    const where = `第 ${i + 1} 个出口`;
    if (exit === null || typeof exit !== 'object' || Array.isArray(exit)) {
      errors.push(`${where}：必须是对象。`);
      return;
    }
    if (!nonEmptyId(exit.id)) {
      errors.push(`${where}：编号 id 不能为空。`);
      return;
    }
    const id = String(exit.id).trim();
    if (exitIds.has(id)) {
      errors.push(`${where}：出口编号 "${id}" 重复。`);
      return;
    }
    if (!isInt(exit.capacity)) {
      errors.push(`${where}(编号 "${id}")：出口容量必须是非负整数。`);
    } else if (exit.capacity < 0) {
      errors.push(`${where}(编号 "${id}")：出口容量不能为负数（收到 ${exit.capacity}）。`);
    } else if (exit.capacity > MAX_NUMBER) {
      errors.push(`${where}(编号 "${id}")：出口容量超出上限 ${MAX_NUMBER}。`);
    }
    exitIds.add(id);
    exits.push({ id, name: exit.name === undefined ? '' : String(exit.name).slice(0, 100), capacity: exit.capacity });
  });

  // 房间与出口共享同一节点命名空间，禁止互相重名。
  for (const id of roomIds) {
    if (exitIds.has(id)) errors.push(`编号 "${id}" 同时被房间和出口使用，节点编号必须全局唯一。`);
  }

  if (exitsRaw.length === 0) {
    errors.push('方案必须至少包含一个出口，没有出口的方案无法撤离。');
  }

  const passages = [];
  passagesRaw.forEach((p, i) => {
    const where = `第 ${i + 1} 条通道`;
    if (p === null || typeof p !== 'object' || Array.isArray(p)) {
      errors.push(`${where}：必须是对象。`);
      return;
    }
    const from = nonEmptyId(p.from) ? String(p.from).trim() : null;
    const to = nonEmptyId(p.to) ? String(p.to).trim() : null;
    if (from === null) errors.push(`${where}：起点 from 不能为空。`);
    if (to === null) errors.push(`${where}：终点 to 不能为空。`);
    if (from !== null && !roomIds.has(from) && !exitIds.has(from)) {
      errors.push(`${where}：起点 "${from}" 不存在，必须引用已定义的房间或出口。`);
    }
    if (to !== null && !roomIds.has(to) && !exitIds.has(to)) {
      errors.push(`${where}：终点 "${to}" 不存在，必须引用已定义的房间或出口。`);
    }
    if (!isInt(p.capacity)) {
      errors.push(`${where}（${from ?? '?'} → ${to ?? '?'}）：单批次容量必须是非负整数。`);
    } else if (p.capacity < 0) {
      errors.push(`${where}（${from ?? '?'} → ${to ?? '?'}）：容量不能为负数（收到 ${p.capacity}）。`);
    } else if (p.capacity > MAX_NUMBER) {
      errors.push(`${where}（${from ?? '?'} → ${to ?? '?'}）：容量超出上限 ${MAX_NUMBER}。`);
    }
    if (from !== null && to !== null && from === to) {
      errors.push(`${where}：起点和终点不能相同（"${from}"），自环通道没有疏散意义。`);
    }
    passages.push({ from, to, capacity: p.capacity });
  });

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    scenario: {
      name,
      rooms: rooms.map((r) => ({ id: r.id, name: r.name, people: r.people })),
      exits: exits.map((e) => ({ id: e.id, name: e.name, capacity: e.capacity })),
      passages: passages.map((p) => ({ from: p.from, to: p.to, capacity: p.capacity })),
    },
  };
}
