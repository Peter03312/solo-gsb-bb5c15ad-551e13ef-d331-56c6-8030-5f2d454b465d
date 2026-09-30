// 前端 API 封装。开发与生产都走同源 /api（开发环境由 Vite 代理）。
async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `请求失败（HTTP ${res.status}）`);
    err.details = data.details || [];
    throw err;
  }
  return data;
}

export const api = {
  list: () => request('/api/scenarios'),
  get: (id) => request(`/api/scenarios/${id}`),
  create: (payload) =>
    request('/api/scenarios', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id, payload) =>
    request(`/api/scenarios/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id) => request(`/api/scenarios/${id}`, { method: 'DELETE' }),
  evaluate: (payload) =>
    request('/api/evaluate', { method: 'POST', body: JSON.stringify(payload) }),
};
