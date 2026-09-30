import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import ScenarioEditor from './ScenarioEditor.jsx';
import ResultPanel from './ResultPanel.jsx';

const EMPTY_FORM = { name: '', rooms: [], exits: [], passages: [] };

function normalizePayload(scenario) {
  // 编辑器中数字输入为空串；提交时统一转为 null 以便后端报“必须是非负整数”，
  // 已保存方案回显则转成数字字符串。
  return scenario;
}

export default function App() {
  const [list, setList] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const refreshList = useCallback(async () => {
    const rows = await api.list();
    setList(rows);
    return rows;
  }, []);

  useEffect(() => {
    refreshList()
      .then((rows) => {
        if (rows.length > 0) loadScenario(rows[0].id);
      })
      .catch((e) => setErrors([e.message]));
    // 仅初始化时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payloadFromForm = () => ({
    name: form.name,
    rooms: form.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      people: r.people === '' || r.people === null ? null : Number(r.people),
    })),
    exits: form.exits.map((x) => ({
      id: x.id,
      name: x.name,
      capacity: x.capacity === '' || x.capacity === null ? null : Number(x.capacity),
    })),
    passages: form.passages.map((p) => ({
      from: p.from,
      to: p.to,
      capacity: p.capacity === '' || p.capacity === null ? null : Number(p.capacity),
    })),
  });

  const showErrors = (e) => {
    setErrors(e.details?.length ? e.details : [e.message]);
    setNotice('');
  };

  const handleEvaluate = async () => {
    setLoading(true);
    setErrors([]);
    try {
      const data = await api.evaluate(normalizePayload(payloadFromForm()));
      setResult(data.result);
      setErrors([]);
    } catch (e) {
      setResult(null);
      showErrors(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const payload = payloadFromForm();
      const data = currentId
        ? await api.update(currentId, payload)
        : await api.create(payload);
      setResult(data.result);
      setCurrentId(data.id);
      setNotice(`方案「${data.scenario.name || data.id}」已保存（id=${data.id}）。`);
      await refreshList();
    } catch (e) {
      showErrors(e);
    } finally {
      setSaving(false);
    }
  };

  async function loadScenario(id) {
    setLoading(true);
    setErrors([]);
    try {
      const data = await api.get(id);
      setCurrentId(data.id);
      setForm({
        name: data.scenario.name || '',
        rooms: data.scenario.rooms.map((r) => ({ ...r, people: String(r.people) })),
        exits: data.scenario.exits.map((x) => ({ ...x, capacity: String(x.capacity) })),
        passages: data.scenario.passages.map((p) => ({ ...p, capacity: String(p.capacity) })),
      });
      setResult(data.result);
      setNotice(`已加载方案 #${data.id}。`);
    } catch (e) {
      showErrors(e);
    } finally {
      setLoading(false);
    }
  }

  const handleNew = () => {
    setCurrentId(null);
    setForm(EMPTY_FORM);
    setResult(null);
    setErrors([]);
    setNotice('正在编辑新方案，填写后请保存。');
  };

  const handleReset = () => {
    setForm(EMPTY_FORM);
    setResult(null);
    setErrors([]);
    setNotice('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`确认删除方案 #${id}？此操作不可恢复。`)) return;
    try {
      await api.remove(id);
      const rows = await refreshList();
      if (currentId === id) {
        if (rows.length > 0) await loadScenario(rows[0].id);
        else handleNew();
      }
    } catch (e) {
      showErrors(e);
    }
  };

  const isNew = currentId === null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🚨</span>
          <div>
            <h1>展馆应急疏散通行能力审核</h1>
            <p>全员同时撤离 · 最大流核定 · 出口封闭情景比对</p>
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>已存方案</h2>
            <button type="button" className="btn small" onClick={handleNew}>
              新建
            </button>
          </div>
          {list.length === 0 && <p className="hint">尚无已保存方案。</p>}
          <ul className="scenario-list">
            {list.map((s) => (
              <li key={s.id} className={s.id === currentId ? 'active' : ''}>
                <button type="button" className="scenario-item" onClick={() => loadScenario(s.id)}>
                  <span className="scenario-id">#{s.id}</span>
                  <span className="scenario-name">{s.name || '未命名方案'}</span>
                </button>
                <button
                  type="button"
                  className="btn-link danger tiny"
                  onClick={() => handleDelete(s.id)}
                  title="删除方案"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="sidebar-foot">
            <p>
              优先级：先最大化总送达人数；总量相同时，按房间编号顺序优先满足编号靠前的房间。
            </p>
          </div>
        </aside>

        <main className="main">
          {notice && <div className="notice">{notice}</div>}
          {errors.length > 0 && (
            <div className="error-box">
              <b>方案被拒绝：</b>
              <ul>
                {errors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          {loading && <div className="loading">计算中…</div>}
          <div className="columns">
            <ScenarioEditor
              form={form}
              setForm={setForm}
              saving={saving}
              onSave={handleSave}
              onCalculate={handleEvaluate}
              onReset={handleReset}
              isNew={isNew}
            />
            <div className="result-col">
              <ResultPanel result={result} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
