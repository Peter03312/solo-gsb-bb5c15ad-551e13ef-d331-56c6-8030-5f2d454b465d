import { useEffect, useState } from 'react';

function emptyDraft() {
  return {
    name: '',
    rooms: [{ code: '', occupants: '' }],
    passages: [],
    exits: [{ code: '', room_code: '', capacity: '' }],
  };
}

function planToDraft(plan) {
  return {
    name: plan.name,
    rooms: plan.rooms.map((r) => ({ code: r.code, occupants: r.occupants })),
    passages: plan.passages.map((p) => ({
      from_code: p.from_code,
      to_code: p.to_code,
      kind: p.kind === 'door' ? 'door' : 'passage',
      capacity: p.capacity,
    })),
    exits: plan.exits.map((e) => ({
      code: e.code,
      room_code: e.room_code,
      capacity: e.capacity,
    })),
  };
}

// 表单内仍用字符串，提交时统一转为整数并交给后端校验
function draftToPayload(draft) {
  return {
    name: draft.name,
    rooms: draft.rooms.map((r) => ({
      code: r.code,
      occupants: Number(r.occupants),
    })),
    passages: draft.passages.map((p) => ({
      from_code: p.from_code,
      to_code: p.to_code,
      kind: p.kind || 'passage',
      capacity: Number(p.capacity),
    })),
    exits: draft.exits.map((e) => ({
      code: e.code,
      room_code: e.room_code,
      capacity: Number(e.capacity),
    })),
  };
}

export default function PlanEditor({ editingPlan, onSaved, onCancel }) {
  const [draft, setDraft] = useState(emptyDraft());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError('');
    setDraft(editingPlan ? planToDraft(editingPlan) : emptyDraft());
  }, [editingPlan]);

  const update = (fn) => setDraft((d) => fn({ ...d }));

  const row = (section, i, field, value, placeholder, type = 'text') => (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) =>
        update((d) => {
          d[section][i][field] = e.target.value;
          return d;
        })
      }
    />
  );

  const removeBtn = (fn) => (
    <button type="button" className="btn-icon danger" onClick={fn} title="删除此行">
      ✕
    </button>
  );

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSaved(draftToPayload(draft));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="editor card" onSubmit={submit}>
      <h2>{editingPlan ? `编辑方案：${editingPlan.name}` : '新建疏散方案'}</h2>

      <label className="field">
        <span>方案名称</span>
        <input
          value={draft.name}
          placeholder="例如：一号展馆 · 常态展"
          onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
        />
      </label>

      <fieldset>
        <legend>房间与待疏散人数</legend>
        <div className="grid grid-room">
          {draft.rooms.map((r, i) => (
            <div className="editable-row" key={i}>
              {row('rooms', i, 'code', r.code, '房间编号，如 R101')}
              {row('rooms', i, 'occupants', r.occupants, '待疏散人数', 'number')}
              {removeBtn(() =>
                update((d) => {
                  d.rooms.splice(i, 1);
                  return d;
                })
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn small"
          onClick={() => update((d) => ({ ...d, rooms: [...d.rooms, { code: '', occupants: '' }] }))}
        >
          + 添加房间
        </button>
      </fieldset>

      <fieldset>
        <legend>有向门 / 通道（单批次容量，各房间共享）</legend>
        <div className="grid grid-passage">
          {draft.passages.map((p, i) => (
            <div className="editable-row" key={i}>
              {row('passages', i, 'from_code', p.from_code, '起点房间')}
              <span className="arrow">→</span>
              {row('passages', i, 'to_code', p.to_code, '终点房间')}
              <select
                value={p.kind}
                onChange={(e) =>
                  update((d) => {
                    d.passages[i].kind = e.target.value;
                    return d;
                  })
                }
              >
                <option value="passage">通道</option>
                <option value="door">门</option>
              </select>
              {row('passages', i, 'capacity', p.capacity, '单批次容量', 'number')}
              {removeBtn(() =>
                update((d) => {
                  d.passages.splice(i, 1);
                  return d;
                })
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn small"
          onClick={() =>
            update((d) => ({
              ...d,
              passages: [
                ...d.passages,
                { from_code: '', to_code: '', kind: 'passage', capacity: '' },
              ],
            }))
          }
        >
          + 添加门 / 通道
        </button>
      </fieldset>

      <fieldset>
        <legend>出口（所在房间与容量）</legend>
        <div className="grid grid-exit">
          {draft.exits.map((x, i) => (
            <div className="editable-row" key={i}>
              {row('exits', i, 'code', x.code, '出口编号，如 E-东')}
              {row('exits', i, 'room_code', x.room_code, '所在房间编号')}
              {row('exits', i, 'capacity', x.capacity, '出口容量', 'number')}
              {removeBtn(() =>
                update((d) => {
                  d.exits.splice(i, 1);
                  return d;
                })
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn small"
          onClick={() =>
            update((d) => ({
              ...d,
              exits: [...d.exits, { code: '', room_code: '', capacity: '' }],
            }))
          }
        >
          + 添加出口
        </button>
      </fieldset>

      {error && <div className="alert error">⚠ {error}</div>}

      <div className="actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? '保存中…' : '保存并校验'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}
