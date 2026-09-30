import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db, replacePlanData, getPlan } from './db.js';
import { validatePlan, ValidationError } from './validation.js';
import { analyzePlan } from './evacuation.js';
import { seedDemoIfEmpty } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

const app = express();
app.use(express.json({ limit: '2mb' }));

// ---- 方案 CRUD ----
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/plans', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.created_at, p.updated_at,
              (SELECT COUNT(*) FROM rooms r WHERE r.plan_id = p.id) AS room_count,
              (SELECT COUNT(*) FROM exits e WHERE e.plan_id = p.id) AS exit_count
         FROM plans p
        ORDER BY p.id`
    )
    .all();
  res.json(rows);
});

app.get('/api/plans/:id', (req, res) => {
  const plan = getPlan(Number(req.params.id));
  if (!plan) return res.status(404).json({ error: '方案不存在' });
  res.json(plan);
});

app.post('/api/plans', (req, res) => {
  const data = validatePlan(req.body);
  const exists = db.prepare('SELECT id FROM plans WHERE name = ?').get(data.name);
  if (exists) throw new ValidationError(`方案名称已存在：${data.name}`);
  const info = db
    .prepare('INSERT INTO plans (name) VALUES (?)')
    .run(data.name);
  replacePlanData(info.lastInsertRowid, data);
  res.status(201).json(getPlan(info.lastInsertRowid));
});

app.put('/api/plans/:id', (req, res) => {
  const id = Number(req.params.id);
  const plan = getPlan(id);
  if (!plan) return res.status(404).json({ error: '方案不存在' });
  const data = validatePlan(req.body);
  const dup = db
    .prepare('SELECT id FROM plans WHERE name = ? AND id != ?')
    .get(data.name, id);
  if (dup) throw new ValidationError(`方案名称已存在：${data.name}`);
  db.prepare("UPDATE plans SET name = ?, updated_at = datetime('now') WHERE id = ?").run(
    data.name,
    id
  );
  replacePlanData(id, data);
  res.json(getPlan(id));
});

app.delete('/api/plans/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM plans WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: '方案不存在' });
  res.status(204).end();
});

// ---- 疏散分析：正常 + 逐一封闭单个出口 ----
app.get('/api/plans/:id/analysis', (req, res) => {
  const plan = getPlan(Number(req.params.id));
  if (!plan) return res.status(404).json({ error: '方案不存在' });
  res.json(analyzePlan(plan));
});

// ---- 错误处理 ----
app.use((err, _req, res, _next) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(400).json({ error: '名称或编号重复' });
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

// ---- 生产环境静态前端 ----
const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(join(clientDist, 'index.html'), (err) => {
    if (err) res.status(200).type('text/plain').send('请先构建前端：npm run build:client');
  });
});

if (process.env.SEED_DEMO !== '0') {
  seedDemoIfEmpty();
}

app.listen(PORT, () => {
  console.log(`应急疏散通行能力审核服务已启动: http://0.0.0.0:${PORT}`);
});
