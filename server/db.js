import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || '/data/evacuation.db';

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS plans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id    INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  occupants  INTEGER NOT NULL,
  UNIQUE (plan_id, code)
);

CREATE TABLE IF NOT EXISTS passages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id   INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  from_code TEXT NOT NULL,
  to_code   TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'passage' CHECK (kind IN ('door', 'passage')),
  capacity  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS exits (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id   INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  code      TEXT NOT NULL,
  room_code TEXT NOT NULL,
  capacity  INTEGER NOT NULL,
  UNIQUE (plan_id, code)
);
`);

export function replacePlanData(planId, data) {
  const insertRoom = db.prepare(
    'INSERT INTO rooms (plan_id, code, occupants) VALUES (?, ?, ?)'
  );
  const insertPassage = db.prepare(
    'INSERT INTO passages (plan_id, from_code, to_code, kind, capacity) VALUES (?, ?, ?, ?, ?)'
  );
  const insertExit = db.prepare(
    'INSERT INTO exits (plan_id, code, room_code, capacity) VALUES (?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM rooms WHERE plan_id = ?').run(planId);
    db.prepare('DELETE FROM passages WHERE plan_id = ?').run(planId);
    db.prepare('DELETE FROM exits WHERE plan_id = ?').run(planId);
    for (const r of data.rooms) {
      insertRoom.run(planId, r.code, r.occupants);
    }
    for (const p of data.passages) {
      insertPassage.run(planId, p.from_code, p.to_code, p.kind || 'passage', p.capacity);
    }
    for (const e of data.exits) {
      insertExit.run(planId, e.code, e.room_code, e.capacity);
    }
  });
  tx();
}

export function getPlan(id) {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  if (!plan) return null;
  plan.rooms = db.prepare(
    'SELECT code, occupants FROM rooms WHERE plan_id = ? ORDER BY id'
  ).all(id);
  plan.passages = db.prepare(
    'SELECT from_code, to_code, kind, capacity FROM passages WHERE plan_id = ? ORDER BY id'
  ).all(id);
  plan.exits = db.prepare(
    'SELECT code, room_code, capacity FROM exits WHERE plan_id = ? ORDER BY id'
  ).all(id);
  return plan;
}
