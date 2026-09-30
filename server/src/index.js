'use strict';

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openDatabase,
  listScenarios,
  getScenario,
  createScenario,
  updateScenario,
  deleteScenario,
} from './db.js';
import { validateScenario } from './validation.js';
import { evaluate } from './evacuation.js';
import { sampleScenario } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'evacuation.db');
const SEED_ON_EMPTY = process.env.SEED_ON_EMPTY !== 'false';
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', 'public');

const db = openDatabase(DB_PATH);

if (SEED_ON_EMPTY && listScenarios(db).length === 0) {
  const check = validateScenario(sampleScenario);
  if (check.ok) createScenario(db, { name: sampleScenario.name, payload: check.scenario });
  console.log('[seed] 已写入示例方案。');
}

const app = express();
app.use(express.json({ limit: '2mb' }));

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: '方案 id 必须是正整数。' });
    return null;
  }
  return id;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// 方案列表
app.get('/api/scenarios', (_req, res) => {
  res.json(listScenarios(db));
});

// 单个方案详情（含正常 + 封闭每个出口的计算结果）
app.get('/api/scenarios/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const row = getScenario(db, id);
  if (!row) return res.status(404).json({ error: `方案 ${id} 不存在。` });
  const payload = JSON.parse(row.payload);
  const result = evaluate(payload);
  res.json({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, scenario: payload, result });
});

// 新建方案
app.post('/api/scenarios', (req, res) => {
  const check = validateScenario(req.body);
  if (!check.ok) return res.status(422).json({ error: '方案校验未通过。', details: check.errors });
  const row = createScenario(db, { name: check.scenario.name, payload: check.scenario });
  const result = evaluate(check.scenario);
  res.status(201).json({ id: row.id, name: row.name, scenario: check.scenario, result });
});

// 修改方案
app.put('/api/scenarios/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  if (!getScenario(db, id)) return res.status(404).json({ error: `方案 ${id} 不存在。` });
  const check = validateScenario(req.body);
  if (!check.ok) return res.status(422).json({ error: '方案校验未通过。', details: check.errors });
  const row = updateScenario(db, id, { name: check.scenario.name, payload: check.scenario });
  const result = evaluate(check.scenario);
  res.json({ id: row.id, name: row.name, scenario: check.scenario, result });
});

// 删除方案
app.delete('/api/scenarios/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const removed = deleteScenario(db, id);
  if (!removed) return res.status(404).json({ error: `方案 ${id} 不存在。` });
  res.status(204).end();
});

// 不保存、只做试算（页面编辑时即时计算）
app.post('/api/evaluate', (req, res) => {
  const check = validateScenario(req.body);
  if (!check.ok) return res.status(422).json({ error: '方案校验未通过。', details: check.errors });
  res.json({ scenario: check.scenario, result: evaluate(check.scenario) });
});

app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));

// 托管 React 构建产物
app.use(express.static(STATIC_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(STATIC_DIR, 'index.html'), (err) => {
    if (err) res.status(200).type('text/plain').send('前端尚未构建，请先运行 web 构建（Docker 镜像已包含构建产物）。');
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: `请求解析失败：${err.message}` });
});

app.listen(PORT, () => {
  console.log(`应急疏散通行能力审核服务已启动：http://0.0.0.0:${PORT}`);
  console.log(`数据库：${DB_PATH}`);
});
