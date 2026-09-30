// Dinic 最大流（整数容量）
// 边以 [to, rev, cap] 形式存放在邻接表中。
export class Dinic {
  constructor(n) {
    this.n = n;
    this.g = Array.from({ length: n }, () => []);
  }

  // 返回正向边对象，便于事后读取流量（原始容量 - 残量）
  addEdge(from, to, cap) {
    const fwd = { to, rev: -1, cap, originalCap: cap };
    const rev = { to: from, rev: -1, cap: 0, originalCap: 0 };
    fwd.rev = this.g[to].length;
    rev.rev = this.g[from].length;
    this.g[from].push(fwd);
    this.g[to].push(rev);
    return fwd;
  }

  bfs(s, t) {
    const level = new Int32Array(this.n).fill(-1);
    level[s] = 0;
    const queue = [s];
    let head = 0;
    while (head < queue.length) {
      const v = queue[head++];
      for (const e of this.g[v]) {
        if (e.cap > 0 && level[e.to] < 0) {
          level[e.to] = level[v] + 1;
          queue.push(e.to);
        }
      }
    }
    this.level = level;
    return level[t] >= 0;
  }

  dfs(v, t, pushed) {
    if (v === t) return pushed;
    const gv = this.g[v];
    for (let i = this.it[v]; i < gv.length; i = ++this.it[v]) {
      const e = gv[i];
      if (e.cap > 0 && this.level[e.to] === this.level[v] + 1) {
        const d = this.dfs(e.to, t, Math.min(pushed, e.cap));
        if (d > 0) {
          e.cap -= d;
          this.g[e.to][e.rev].cap += d;
          return d;
        }
      }
    }
    return 0;
  }

  maxFlow(s, t, limit = Infinity) {
    let flow = 0;
    while (flow < limit && this.bfs(s, t)) {
      this.it = new Int32Array(this.n);
      while (flow < limit) {
        const f = this.dfs(s, t, limit - flow);
        if (f === 0) break;
        flow += f;
      }
    }
    return flow;
  }
}
