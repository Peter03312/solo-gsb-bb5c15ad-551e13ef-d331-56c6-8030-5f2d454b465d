import { db, replacePlanData } from './db.js';
import { validatePlan } from './validation.js';

const DEMO = {
  name: '示例展馆 · 两层展区',
  rooms: [
    { code: 'R101', occupants: 100 },
    { code: 'R102', occupants: 70 },
    { code: 'R103', occupants: 80 },
    { code: 'R104', occupants: 50 },
    { code: 'R201', occupants: 60 },
  ],
  passages: [
    { from_code: 'R101', to_code: 'R102', kind: 'door', capacity: 90 },
    { from_code: 'R102', to_code: 'R103', kind: 'passage', capacity: 60 },
    { from_code: 'R103', to_code: 'R104', kind: 'door', capacity: 40 },
    { from_code: 'R104', to_code: 'R103', kind: 'door', capacity: 40 },
    { from_code: 'R101', to_code: 'R104', kind: 'passage', capacity: 30 },
    { from_code: 'R102', to_code: 'R201', kind: 'passage', capacity: 50 },
  ],
  exits: [
    { code: 'E-东出口', room_code: 'R104', capacity: 150 },
    { code: 'E-西出口', room_code: 'R201', capacity: 100 },
  ],
};

export function seedDemoIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM plans').get().c;
  if (count > 0) return;
  const data = validatePlan(DEMO);
  const info = db.prepare('INSERT INTO plans (name) VALUES (?)').run(data.name);
  replacePlanData(info.lastInsertRowid, data);
  console.log('已写入示例方案：', data.name);
}
