/**
 * CUA API helper — thin fetch wrapper for /api/cua/<feature> endpoints
 */
const API_HOST =
  typeof window !== 'undefined' && window.location.port === '3600'
    ? 'http://localhost:3500'
    : 'http://localhost:3001';

const BASE = API_HOST + '/api/cua';

const hdrs = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const hj = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

const get = (url) => fetch(url, { headers: hdrs() }).then(hj);
const post = (url, body) =>
  fetch(url, { method: 'POST', headers: hdrs(), body: JSON.stringify(body) }).then(hj);
const put = (url, body) =>
  fetch(url, { method: 'PUT', headers: hdrs(), body: JSON.stringify(body) }).then(hj);
const del = (url, body) =>
  fetch(url, { method: 'DELETE', headers: hdrs(), ...(body ? { body: JSON.stringify(body) } : {}) }).then(hj);

/**
 * Factory: returns CRUD + AI verb helpers for a given CUA feature slug
 * e.g. cuaFeat('desktopControl') → base URL /api/cua/desktopControl
 */
export function cuaFeat(slug) {
  const base = `${BASE}/${slug}`;
  return {
    list: (params) => get(`${base}?${new URLSearchParams(params || {})}`),
    count: (params) => get(`${base}/count?${new URLSearchParams(params || {})}`),
    search: (q, params) => get(`${base}/search?q=${encodeURIComponent(q)}&${new URLSearchParams(params || {})}`),
    stats: () => get(`${base}/stats/summary`),
    getById: (id) => get(`${base}/${id}`),
    create: (body) => post(base, body),
    update: (id, body) => put(`${base}/${id}`, body),
    remove: (id) => del(`${base}/${id}`),
    archive: (id) => post(`${base}/${id}/archive`, {}),
    restore: (id) => post(`${base}/${id}/restore`, {}),
    history: (id) => get(`${base}/${id}/history`),
    exportCsvUrl: () => `${base}/export/csv`,
    aiVerb: (verb, body) => post(`${base}/ai/${verb}`, body),
  };
}

export default cuaFeat;
