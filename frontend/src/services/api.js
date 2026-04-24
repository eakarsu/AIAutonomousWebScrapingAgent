const API_URL = 'http://localhost:3001/api';

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const api = {
  login: async (email, password) => {
    const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (data.token) localStorage.setItem('token', data.token);
    return data;
  },
  getStats: () => fetch(`${API_URL}/stats`, { headers: getHeaders() }).then(r => r.json()),
  getJobs: () => fetch(`${API_URL}/jobs`, { headers: getHeaders() }).then(r => r.json()),
  getJob: (id) => fetch(`${API_URL}/jobs/${id}`, { headers: getHeaders() }).then(r => r.json()),
  createJob: (data) => fetch(`${API_URL}/jobs`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(r => r.json()),
  updateJob: (id, data) => fetch(`${API_URL}/jobs/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then(r => r.json()),
  deleteJob: (id) => fetch(`${API_URL}/jobs/${id}`, { method: 'DELETE', headers: getHeaders() }).then(r => r.json()),
  getData: (params) => fetch(`${API_URL}/data?${new URLSearchParams(params || {})}`, { headers: getHeaders() }).then(r => r.json()),
  deleteData: (id) => fetch(`${API_URL}/data/${id}`, { method: 'DELETE', headers: getHeaders() }).then(r => r.json()),
  getLogs: (params) => fetch(`${API_URL}/logs?${new URLSearchParams(params || {})}`, { headers: getHeaders() }).then(r => r.json()),
  analyzeUrl: (data) => fetch(`${API_URL}/agents/analyze-url`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(r => r.json()),
  extractData: (data) => fetch(`${API_URL}/agents/extract-data`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(r => r.json()),
  cleanData: (data) => fetch(`${API_URL}/agents/clean-data`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(r => r.json()),
};

export default api;
