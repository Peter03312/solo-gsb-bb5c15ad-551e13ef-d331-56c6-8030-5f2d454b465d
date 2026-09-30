const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && data.error) || `请求失败（${res.status}）`);
  }
  return data;
}

export const api = {
  listPlans: () => request('/plans'),
  getPlan: (id) => request(`/plans/${id}`),
  createPlan: (data) => request('/plans', { method: 'POST', body: JSON.stringify(data) }),
  updatePlan: (id, data) =>
    request(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePlan: (id) => request(`/plans/${id}`, { method: 'DELETE' }),
  analyze: (id) => request(`/plans/${id}/analysis`),
};
