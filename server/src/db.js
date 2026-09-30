'use strict';

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * SQLite 存储。方案的房间/出口/通道以 JSON 列保存，
 * 计算结果在读取/查询时实时计算（容量变更后结果始终最新）。
 */
export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS scenarios (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL DEFAULT '',
      payload    TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

export function listScenarios(db) {
  return db
    .prepare('SELECT id, name, created_at, updated_at FROM scenarios ORDER BY id ASC')
    .all();
}

export function getScenario(db, id) {
  return db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id);
}

export function createScenario(db, { name, payload }) {
  const info = db
    .prepare('INSERT INTO scenarios (name, payload) VALUES (?, ?)')
    .run(name, JSON.stringify(payload));
  return getScenario(db, info.lastInsertRowid);
}

export function updateScenario(db, id, { name, payload }) {
  const info = db
    .prepare("UPDATE scenarios SET name = ?, payload = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, JSON.stringify(payload), id);
  return info.changes > 0 ? getScenario(db, id) : null;
}

export function deleteScenario(db, id) {
  const info = db.prepare('DELETE FROM scenarios WHERE id = ?').run(id);
  return info.changes > 0;
}
