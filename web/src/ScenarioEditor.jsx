import React from 'react';

// 通用行删除 / 增加按钮
function RowControls({ onRemove, canRemove = true }) {
  return (
    <td className="row-actions">
      <button type="button" className="btn-link danger" onClick={onRemove} disabled={!canRemove}>
        删除
      </button>
    </td>
  );
}

function Section({ title, hint, onAdd, addLabel, children }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <button type="button" className="btn small" onClick={onAdd}>
          + {addLabel}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

export default function ScenarioEditor({ form, setForm, saving, onSave, onCalculate, onReset, isNew }) {
  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const updateRow = (field, idx, key, value) =>
    setForm((f) => ({
      ...f,
      [field]: f[field].map((row, i) => (i === idx ? { ...row, [key]: value } : row)),
    }));

  const addRow = (field, row) => setForm((f) => ({ ...f, [field]: [...f[field], row] }));
  const removeRow = (field, idx) =>
    setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }));

  return (
    <div className="editor">
      <section className="card">
        <div className="card-head">
          <h2>方案信息</h2>
        </div>
        <label className="field">
          <span>方案名称</span>
          <input
            type="text"
            value={form.name}
            placeholder="例如：1 号展馆一层"
            onChange={(e) => update('name', e.target.value)}
          />
        </label>
      </section>

      <Section
        title="房间与待疏散人数"
        hint="所有房间按同时撤离计算；编号用于同量方案的优先顺序（数字按数值、其他按字典序）。"
        addLabel="添加房间"
        onAdd={() => addRow('rooms', { id: '', name: '', people: '' })}
      >
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: '18%' }}>房间编号</th>
              <th style={{ width: '40%' }}>名称（可选）</th>
              <th style={{ width: '26%' }}>待疏散人数</th>
              <th style={{ width: '16%' }}></th>
            </tr>
          </thead>
          <tbody>
            {form.rooms.map((r, i) => (
              <tr key={i}>
                <td>
                  <input value={r.id} placeholder="如 R1 / 101" onChange={(e) => updateRow('rooms', i, 'id', e.target.value)} />
                </td>
                <td>
                  <input value={r.name} onChange={(e) => updateRow('rooms', i, 'name', e.target.value)} />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={r.people}
                    placeholder="非负整数"
                    onChange={(e) => updateRow('rooms', i, 'people', e.target.value)}
                  />
                </td>
                <RowControls onRemove={() => removeRow('rooms', i)} />
              </tr>
            ))}
            {form.rooms.length === 0 && (
              <tr>
                <td colSpan="4" className="empty">暂无房间，点击右上角添加。</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section
        title="出口容量"
        hint="至少需要一个出口；封闭某出口时该出口不能作为终点，但其连通通道仍可用于中转。"
        addLabel="添加出口"
        onAdd={() => addRow('exits', { id: '', name: '', capacity: '' })}
      >
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: '18%' }}>出口编号</th>
              <th style={{ width: '40%' }}>名称（可选）</th>
              <th style={{ width: '26%' }}>出口容量（人/批次）</th>
              <th style={{ width: '16%' }}></th>
            </tr>
          </thead>
          <tbody>
            {form.exits.map((x, i) => (
              <tr key={i}>
                <td>
                  <input value={x.id} placeholder="如 E1" onChange={(e) => updateRow('exits', i, 'id', e.target.value)} />
                </td>
                <td>
                  <input value={x.name} onChange={(e) => updateRow('exits', i, 'name', e.target.value)} />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={x.capacity}
                    placeholder="非负整数"
                    onChange={(e) => updateRow('exits', i, 'capacity', e.target.value)}
                  />
                </td>
                <RowControls onRemove={() => removeRow('exits', i)} />
              </tr>
            ))}
            {form.exits.length === 0 && (
              <tr>
                <td colSpan="4" className="empty">暂无出口。</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section
        title="有向门 / 通道"
        hint="通道为有向边，起点和终点必须是已定义的房间或出口；编号相同的两条平行通道容量叠加。容量被所有房间共享。"
        addLabel="添加通道"
        onAdd={() => addRow('passages', { from: '', to: '', capacity: '' })}
      >
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: '30%' }}>起点</th>
              <th style={{ width: '8%' }}></th>
              <th style={{ width: '30%' }}>终点</th>
              <th style={{ width: '22%' }}>单批次容量</th>
              <th style={{ width: '10%' }}></th>
            </tr>
          </thead>
          <tbody>
            {form.passages.map((p, i) => (
              <tr key={i}>
                <td>
                  <input value={p.from} placeholder="房间 / 出口编号" onChange={(e) => updateRow('passages', i, 'from', e.target.value)} />
                </td>
                <td className="arrow">→</td>
                <td>
                  <input value={p.to} placeholder="房间 / 出口编号" onChange={(e) => updateRow('passages', i, 'to', e.target.value)} />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={p.capacity}
                    placeholder="非负整数"
                    onChange={(e) => updateRow('passages', i, 'capacity', e.target.value)}
                  />
                </td>
                <RowControls onRemove={() => removeRow('passages', i)} />
              </tr>
            ))}
            {form.passages.length === 0 && (
              <tr>
                <td colSpan="5" className="empty">暂无通道。</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <div className="action-bar">
        <button type="button" className="btn primary" onClick={onCalculate}>
          试算（不保存）
        </button>
        <button type="button" className="btn success" onClick={onSave} disabled={saving}>
          {isNew ? '保存为新方案' : '保存修改'}
        </button>
        <button type="button" className="btn" onClick={onReset}>
          清空
        </button>
      </div>
    </div>
  );
}
