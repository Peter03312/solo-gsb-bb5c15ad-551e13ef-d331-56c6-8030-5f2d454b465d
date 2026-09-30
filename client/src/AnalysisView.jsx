function StatCards({ scenario, tone }) {
  return (
    <div className={`stat-row ${tone || ''}`}>
      <div className="stat">
        <div className="stat-label">需求总人数</div>
        <div className="stat-value">{scenario.demand}</div>
      </div>
      <div className="stat good">
        <div className="stat-label">最大可送达人数</div>
        <div className="stat-value">{scenario.delivered}</div>
      </div>
      <div className={`stat ${scenario.gap > 0 ? 'bad' : ''}`}>
        <div className="stat-label">总缺口</div>
        <div className="stat-value">{scenario.gap}</div>
      </div>
      <div className={`stat ${scenario.all_satisfied ? 'good' : 'warn'}`}>
        <div className="stat-label">结论</div>
        <div className="stat-value text">
          {scenario.all_satisfied ? '全部满足' : `${scenario.unmet_rooms.length} 个房间未满足`}
        </div>
      </div>
    </div>
  );
}

function ScenarioTable({ scenario }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>房间编号</th>
            <th className="num">待疏散人数</th>
            <th className="num">可送达人数</th>
            <th className="num">缺口</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {scenario.rooms.map((r) => (
            <tr key={r.code} className={r.unmet ? 'row-unmet' : 'row-ok'}>
              <td>{r.code}</td>
              <td className="num">{r.occupants}</td>
              <td className="num">{r.evacuated}</td>
              <td className="num">{r.shortfall}</td>
              <td>
                {r.unmet ? (
                  <span className="badge bad">未满足（缺 {r.shortfall} 人）</span>
                ) : (
                  <span className="badge ok">已满足</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsageTables({ scenario }) {
  return (
    <div className="usage-grid">
      <div>
        <h4>出口使用情况</h4>
        <div className="table-wrap">
          <table className="small-table">
            <thead>
              <tr>
                <th>出口</th>
                <th>所在房间</th>
                <th className="num">容量</th>
                <th className="num">通过人数</th>
              </tr>
            </thead>
            <tbody>
              {scenario.exit_usage.map((e) => (
                <tr key={e.code} className={e.closed ? 'row-closed' : ''}>
                  <td>{e.code}</td>
                  <td>{e.room_code}</td>
                  <td className="num">{e.closed ? '—（已封闭）' : e.capacity}</td>
                  <td className="num">{e.used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h4>门 / 通道使用情况（共享容量，同一人只计一次）</h4>
        <div className="table-wrap">
          <table className="small-table">
            <thead>
              <tr>
                <th>方向</th>
                <th>类型</th>
                <th className="num">单批次容量</th>
                <th className="num">占用</th>
              </tr>
            </thead>
            <tbody>
              {scenario.passage_flows.map((p, i) => (
                <tr key={i} className={p.used >= p.capacity && p.capacity > 0 ? 'row-saturated' : ''}>
                  <td>
                    {p.from_code} <span className="arrow">→</span> {p.to_code}
                  </td>
                  <td>{p.kind === 'door' ? '门' : '通道'}</td>
                  <td className="num">{p.capacity}</td>
                  <td className="num">{p.used}</td>
                </tr>
              ))}
              {scenario.passage_flows.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    本方案未设置门 / 通道
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Scenario({ title, subtitle, scenario, tone, defaultOpen = true }) {
  return (
    <details className="scenario" open={defaultOpen}>
      <summary>
        <strong>{title}</strong>
        {subtitle && <span className="muted">　{subtitle}</span>}
        <span className={`chip ${scenario.gap > 0 ? 'chip-bad' : 'chip-ok'}`}>
          送达 {scenario.delivered}/{scenario.demand} · 缺口 {scenario.gap}
        </span>
      </summary>
      <StatCards scenario={scenario} tone={tone} />
      <ScenarioTable scenario={scenario} />
      <UsageTables scenario={scenario} />
    </details>
  );
}

export default function AnalysisView({ analysis, onEdit }) {
  if (!analysis) return null;
  const { normal, closures } = analysis;
  return (
    <div className="analysis">
      <div className="analysis-head">
        <h2>审核结果：{analysis.plan.name}</h2>
        <button className="btn small" onClick={onEdit}>
          修改方案
        </button>
      </div>

      <Scenario
        title="正常情况（所有出口开放，所有房间同时撤离）"
        scenario={normal}
        defaultOpen
      />

      <h3 className="closure-title">逐一封闭单个出口（封闭出口不作为终点，其余容量保持原值）</h3>
      {closures.map((c) => (
        <Scenario
          key={c.closed_exit}
          title={`封闭出口：${c.closed_exit}`}
          subtitle="其余出口与全部通道保持原容量"
          scenario={c}
          tone={c.gap > normal.gap ? 'closure' : ''}
          defaultOpen={false}
        />
      ))}
    </div>
  );
}
