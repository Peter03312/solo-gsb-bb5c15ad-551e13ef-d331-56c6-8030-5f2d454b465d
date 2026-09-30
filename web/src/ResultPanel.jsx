import React from 'react';

function StatCards({ solution, totalPeople }) {
  const satisfied = totalPeople - solution.gap;
  const rate = totalPeople > 0 ? Math.round((satisfied / totalPeople) * 1000) / 10 : 100;
  return (
    <div className="stat-row">
      <div className="stat ok">
        <div className="stat-num">{solution.delivered}</div>
        <div className="stat-label">最大可送达人数</div>
      </div>
      <div className={`stat ${solution.gap > 0 ? 'bad' : 'ok'}`}>
        <div className="stat-num">{solution.gap}</div>
        <div className="stat-label">总缺口</div>
      </div>
      <div className="stat muted">
        <div className="stat-num">{rate}%</div>
        <div className="stat-label">需求满足率</div>
      </div>
    </div>
  );
}

function ExitUsageTable({ solution }) {
  return (
    <table className="grid small">
      <thead>
        <tr>
          <th>出口</th>
          <th>状态</th>
          <th>出口容量</th>
          <th>实际利用</th>
        </tr>
      </thead>
      <tbody>
        {solution.exitUsage.map((u) => (
          <tr key={u.exitId} className={u.closed ? 'closed-row' : ''}>
            <td>{u.exitId}</td>
            <td>{u.closed ? <span className="tag danger">已封闭</span> : <span className="tag ok">开放</span>}</td>
            <td>{u.closed ? u.capacity : u.capacity}</td>
            <td>{u.used}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UnmetTable({ solution }) {
  if (solution.unmet.length === 0) {
    return <p className="all-good">✓ 所有房间的待疏散人员均可全部送达。</p>;
  }
  return (
    <table className="grid small">
      <thead>
        <tr>
          <th>房间编号</th>
          <th>待疏散</th>
          <th>可送达</th>
          <th>未满足人数</th>
          <th>孤立</th>
        </tr>
      </thead>
      <tbody>
        {solution.unmet.map((u) => (
          <tr key={u.roomId} className={u.isolated ? 'isolated-row' : ''}>
            <td>{u.roomId}</td>
            <td>{u.people}</td>
            <td>{u.delivered}</td>
            <td className="num-bad">{u.shortfall}</td>
            <td>{u.isolated ? <span className="tag warn">孤立房间</span> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScenarioResult({ title, badge, solution, totalPeople, defaultOpen = true }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={`result-block ${solution.gap > 0 ? 'has-gap' : ''}`}>
      <button type="button" className="result-head" onClick={() => setOpen((v) => !v)}>
        <span className="result-title">
          {badge && <span className={`tag ${badge.cls}`}>{badge.text}</span>}
          {title}
        </span>
        <span className="result-summary">
          送达 <b>{solution.delivered}</b> · 缺口 <b className={solution.gap > 0 ? 'num-bad' : ''}>{solution.gap}</b>
          <span className="caret">{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        <div className="result-body">
          <StatCards solution={solution} totalPeople={totalPeople} />
          <h3>未满足人数的房间</h3>
          <UnmetTable solution={solution} />
          {solution.isolatedRooms.length > 0 && (
            <p className="isolated-note">
              孤立房间（无法到达任何开放出口，人数全部计入缺口）：
              {solution.isolatedRooms.join('、')}
            </p>
          )}
          <h3>出口利用情况</h3>
          <ExitUsageTable solution={solution} />
        </div>
      )}
    </div>
  );
}

export default function ResultPanel({ result }) {
  if (!result) {
    return (
      <div className="card empty-result">
        <p>填写方案后点击「试算」或「保存」，这里将展示：</p>
        <ul>
          <li>正常情形（所有出口开放）的最大可送达人数、总缺口；</li>
          <li>逐一封闭单个出口时的同样指标；</li>
          <li>未满足人数的房间清单与孤立房间标记。</li>
        </ul>
      </div>
    );
  }

  // 找出缺口最大的封闭情形，便于突出风险
  const worst = result.exitClosures.reduce(
    (a, b) => (b.gap > (a?.gap ?? -1) ? b : a),
    null,
  );

  return (
    <div className="results">
      <ScenarioResult
        title="正常情形（全部出口开放）"
        badge={{ text: '基准', cls: 'ok' }}
        solution={result.normal}
        totalPeople={result.totalPeople}
      />
      <h2 className="closure-title">逐一封闭单个出口</h2>
      {result.exitClosures.map((s) => (
        <ScenarioResult
          key={s.closedExitId}
          title={`封闭出口 ${s.closedExitId}`}
          badge={worst && s.closedExitId === worst.closedExitId ? { text: '最不利', cls: 'danger' } : null}
          solution={s}
          totalPeople={result.totalPeople}
          defaultOpen={false}
        />
      ))}
    </div>
  );
}
