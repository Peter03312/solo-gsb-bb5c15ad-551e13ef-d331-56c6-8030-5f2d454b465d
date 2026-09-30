// 方案输入校验：任何非法输入都会抛出带中文原因的 ValidationError
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const MAX_NUMBER = 1_000_000_000;

function isNonNegInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_NUMBER;
}

function isPosInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_NUMBER;
}

function nonEmptyString(v, field) {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ValidationError(`${field}不能为空`);
  }
  return v.trim();
}

export function validatePlan(input) {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('请求体必须是 JSON 对象');
  }
  const name = nonEmptyString(input.name, '方案名称');

  const rawRooms = Array.isArray(input.rooms) ? input.rooms : null;
  const rawPassages = Array.isArray(input.passages) ? input.passages : [];
  const rawExits = Array.isArray(input.exits) ? input.exits : null;

  if (!rawRooms) throw new ValidationError('房间列表 rooms 缺失或不是数组');
  if (!rawExits) throw new ValidationError('出口列表 exits 缺失或不是数组');
  if (rawRooms.length === 0) throw new ValidationError('方案至少要包含一个房间');

  const rooms = [];
  const roomSet = new Set();
  for (const r of rawRooms) {
    if (!r || typeof r !== 'object') {
      throw new ValidationError('房间条目必须是对象');
    }
    const code = nonEmptyString(r.code, '房间编号');
    if (roomSet.has(code)) {
      throw new ValidationError(`房间编号重复：${code}`);
    }
    if (!isNonNegInt(r.occupants)) {
      throw new ValidationError(
        `房间「${code}」的待疏散人数必须是 0 到 ${MAX_NUMBER.toLocaleString()} 之间的整数（不能为负数）`
      );
    }
    roomSet.add(code);
    rooms.push({ code, occupants: r.occupants });
  }

  const passages = [];
  for (let i = 0; i < rawPassages.length; i++) {
    const p = rawPassages[i];
    if (!p || typeof p !== 'object') {
      throw new ValidationError(`第 ${i + 1} 条通道/门条目必须是对象`);
    }
    const from = nonEmptyString(p.from_code, `第 ${i + 1} 条通道的起点房间`);
    const to = nonEmptyString(p.to_code, `第 ${i + 1} 条通道的终点房间`);
    if (!roomSet.has(from)) {
      throw new ValidationError(`第 ${i + 1} 条通道引用了不存在的房间：${from}`);
    }
    if (!roomSet.has(to)) {
      throw new ValidationError(`第 ${i + 1} 条通道引用了不存在的房间：${to}`);
    }
    if (!isNonNegInt(p.capacity)) {
      throw new ValidationError(
        `通道「${from} → ${to}」的单批次容量必须是 0 到 ${MAX_NUMBER.toLocaleString()} 之间的整数（不能为负数）`
      );
    }
    let kind = 'passage';
    if (p.kind !== undefined && p.kind !== null && p.kind !== '') {
      if (p.kind !== 'door' && p.kind !== 'passage') {
        throw new ValidationError(`通道类型只能是 door（门）或 passage（通道）`);
      }
      kind = p.kind;
    }
    passages.push({ from_code: from, to_code: to, kind, capacity: p.capacity });
  }

  const exits = [];
  const exitSet = new Set();
  for (const e of rawExits) {
    if (!e || typeof e !== 'object') {
      throw new ValidationError('出口条目必须是对象');
    }
    const code = nonEmptyString(e.code, '出口编号');
    if (exitSet.has(code)) {
      throw new ValidationError(`出口编号重复：${code}`);
    }
    const roomCode = nonEmptyString(e.room_code, `出口「${code}」所在房间`);
    if (!roomSet.has(roomCode)) {
      throw new ValidationError(`出口「${code}」引用了不存在的房间：${roomCode}`);
    }
    if (!isNonNegInt(e.capacity)) {
      throw new ValidationError(
        `出口「${code}」的容量必须是 0 到 ${MAX_NUMBER.toLocaleString()} 之间的整数（不能为负数）`
      );
    }
    exitSet.add(code);
    exits.push({ code, room_code: roomCode, capacity: e.capacity });
  }

  // 没有出口的方案无法送达任何人，必须拒绝
  if (exits.length === 0) {
    throw new ValidationError('方案必须至少设置一个出口，否则任何人都无法撤离');
  }
  if (exits.every((e) => e.capacity === 0)) {
    throw new ValidationError('所有出口容量均为 0，该方案不具备疏散通行能力，请设置正容量出口');
  }

  return { name, rooms, passages, exits };
}

export { isPosInt };
