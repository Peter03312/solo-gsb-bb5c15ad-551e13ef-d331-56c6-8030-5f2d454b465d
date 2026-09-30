import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import PlanEditor from './PlanEditor.jsx';
import AnalysisView from './AnalysisView.jsx';

export default function App() {
  const [plans, setPlans] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null); // 非 null 时显示编辑器
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshList = useCallback(async () => {
    const list = await api.listPlans();
    setPlans(list);
    return list;
  }, []);

  useEffect(() => {
    refreshList().catch((e) => setError(e.message));
  }, [refreshList]);

  const openAnalysis = async (id) => {
    setLoading(true);
    setError('');
    setAnalysis(null);
    setSelectedId(id);
    try {
      setAnalysis(await api.analyze(id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaved = async (payload) => {
    if (creating) {
      const created = await api.createPlan(payload);
      setCreating(false);
      setEditingPlan(null);
      await refreshList();
      await openAnalysis(created.id);
    } else {
      const updated = await api.updatePlan(editingPlan.id, payload);
      setEditingPlan(null);
      await refreshList();
      await openAnalysis(updated.id);
    }
  };

  const handleDelete = async (plan) => {
    if (!window.confirm(`确定删除方案「${plan.name}」吗？此操作不可恢复。`)) return;
    await api.deletePlan(plan.id);
    if (selectedId === plan.id) {
      setSelectedId(null);
      setAnalysis(null);
    }
    await refreshList();
  };

  const startCreate = () => {
    setEditingPlan(null);
    setCreating(true);
  };

  const startEdit = async () => {
    setCreating(false);
    setEditingPlan(await api.getPlan(selectedId));
  };

  const showEditor = creating || editingPlan;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>🏛 展馆应急疏散通行能力审核</h1>
          <p className="subtitle">
            录入房间待疏散人数、有向门 / 通道单批次容量与出口容量；按所有房间同时撤离，
            审核正常与逐一封闭单个出口时的最大可送达人数、总缺口及未满足房间
          </p>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar card">
          <div className="sidebar-head">
            <h3>疏散方案</h3>
            <button className="btn primary small" onClick={startCreate}>
              + 新建
            </button>
          </div>
          {error && <div className="alert error">⚠ {error}</div>}
          <ul className="plan-list">
            {plans.map((p) => (
              <li
                key={p.id}
                className={p.id === selectedId ? 'active' : ''}
                onClick={() => !showEditor && openAnalysis(p.id)}
              >
                <div className="plan-name">{p.name}</div>
                <div className="plan-meta">
                  {p.room_count} 个房间 · {p.exit_count} 个出口
                </div>
                <button
                  className="btn-icon danger"
                  title="删除方案"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(p);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
            {plans.length === 0 && <li className="muted">暂无方案，点击「新建」开始录入</li>}
          </ul>
        </aside>

        <section className="content">
          {loading && <div className="card placeholder">计算中…</div>}
          {!loading && showEditor && (
            <PlanEditor
              editingPlan={editingPlan}
              onSaved={handleSaved}
              onCancel={() => {
                setCreating(false);
                setEditingPlan(null);
              }}
            />
          )}
          {!loading && !showEditor && analysis && (
            <AnalysisView analysis={analysis} onEdit={startEdit} />
          )}
          {!loading && !showEditor && !analysis && (
            <div className="card placeholder">
              <p>👈 请在左侧选择一个方案查看审核结果，或新建方案。</p>
              <p className="muted">
                判定规则：先最大化总送达人数；同总量方案按房间编号顺序优先满足；
                封闭出口不作为终点，其他通道与出口容量保持原值；孤立房间计入缺口。
              </p>
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        Node.js · Express · React · SQLite（better-sqlite3）｜最大流 Dinic 算法
      </footer>
    </div>
  );
}
