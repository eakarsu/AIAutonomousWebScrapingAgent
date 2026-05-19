const API_HOST = (typeof window !== 'undefined' && window.location.port === '3600')
  ? 'http://localhost:3500' : 'http://localhost:3001';
const API_URL = API_HOST + '/api';

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const handleJSON = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

const api = {
  // ── Auth ──────────────────────────────────────────────────────────────
  login: async (email, password) => {
    const data = await handleJSON(await fetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }));
    if (data.token) localStorage.setItem('token', data.token);
    return data;
  },

  // ── Stats ─────────────────────────────────────────────────────────────
  getStats: () => fetch(`${API_URL}/stats`, { headers: getHeaders() }).then(handleJSON),

  // ── Jobs CRUD ─────────────────────────────────────────────────────────
  // Returns { data: [], pagination: {} }
  getJobs: (params) => fetch(`${API_URL}/jobs?${new URLSearchParams(params || {})}`, { headers: getHeaders() }).then(handleJSON),
  getJob: (id) => fetch(`${API_URL}/jobs/${id}`, { headers: getHeaders() }).then(handleJSON),
  createJob: (data) => fetch(`${API_URL}/jobs`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  updateJob: (id, data) => fetch(`${API_URL}/jobs/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  deleteJob: (id) => fetch(`${API_URL}/jobs/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleJSON),
  runJob: (id) => fetch(`${API_URL}/jobs/${id}/run`, { method: 'POST', headers: getHeaders() }).then(handleJSON),

  // ── Scraped data ─────────────────────────────────────────────────────
  // Returns { data: [], pagination: {} }
  getData: (params) => fetch(`${API_URL}/data?${new URLSearchParams(params || {})}`, { headers: getHeaders() }).then(handleJSON),
  deleteData: (id) => fetch(`${API_URL}/data/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleJSON),

  // ── Logs ─────────────────────────────────────────────────────────────
  // Returns { data: [], pagination: {} }
  getLogs: (params) => fetch(`${API_URL}/logs?${new URLSearchParams(params || {})}`, { headers: getHeaders() }).then(handleJSON),

  // ── Original AI agents (analyze/extract/clean) ───────────────────────
  analyzeUrl: (data) => fetch(`${API_URL}/agents/analyze-url`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  extractData: (data) => fetch(`${API_URL}/agents/extract-data`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  cleanData: (data) => fetch(`${API_URL}/agents/clean-data`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),

  // ── New AI agents (Schedule/Quality/Selector/Anomaly) ────────────────
  scheduleOptimizer: (jobs) => fetch(`${API_URL}/agents/schedule-optimizer`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ jobs }) }).then(handleJSON),
  qualityValidator: (data) => fetch(`${API_URL}/agents/quality-validator`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  selectorRecommender: (data) => fetch(`${API_URL}/agents/selector-recommender`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  anomalyAlerts: (data) => fetch(`${API_URL}/agents/anomaly-alerts`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),

  // ── Apply pass 5 backlog: headless plan, proxy select, robots check, schema ──
  headlessPlan: (data) => fetch(`${API_URL}/agents/headless-plan`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  proxySelect: (data) => fetch(`${API_URL}/agents/proxy-select`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data || {}) }).then(handleJSON),
  robotsCheck: (data) => fetch(`${API_URL}/agents/robots-check`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  validationSchema: (data) => fetch(`${API_URL}/agents/validation-schema`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  validateRecord: (data) => fetch(`${API_URL}/agents/validate-record`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),

  // ── Apply pass 5 wave-1: data classify + run summary ─────────────────
  dataClassify: (data) => fetch(`${API_URL}/agents/data-classify`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  runSummary: (data) => fetch(`${API_URL}/agents/run-summary`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),

  // ── AI Results history ────────────────────────────────────────────────
  getAIResults: (params) => fetch(`${API_URL}/ai-results?${new URLSearchParams(params || {})}`, { headers: getHeaders() }).then(handleJSON),
  getAIResult: (id) => fetch(`${API_URL}/ai-results/${id}`, { headers: getHeaders() }).then(handleJSON),

  // ── Competitive agents ───────────────────────────────────────────────
  listCompetitiveAgents: () => fetch(`${API_URL}/competitive-agents`, { headers: getHeaders() }).then(handleJSON),
  getCompetitiveAgent: (id) => fetch(`${API_URL}/competitive-agents/${id}`, { headers: getHeaders() }).then(handleJSON),
  createCompetitiveAgent: (data) => fetch(`${API_URL}/competitive-agents`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  updateCompetitiveAgent: (id, data) => fetch(`${API_URL}/competitive-agents/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  deleteCompetitiveAgent: (id) => fetch(`${API_URL}/competitive-agents/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleJSON),
  runCompetitiveAgent: (id) => fetch(`${API_URL}/competitive-agents/${id}/run`, { method: 'POST', headers: getHeaders() }).then(handleJSON),
  competitiveAgentResults: (id, params) => fetch(`${API_URL}/competitive-agents/${id}/results?${new URLSearchParams(params || {})}`, { headers: getHeaders() }).then(handleJSON),
  // Legacy
  analyzeCompetitor: (data) => fetch(`${API_URL}/competitive-agents/analyze-competitor`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  analyzeMarket: (data) => fetch(`${API_URL}/competitive-agents/analyze-market`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  generateSWOT: (data) => fetch(`${API_URL}/competitive-agents/generate-swot`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),

  // ── Async job queue ──────────────────────────────────────────────────
  // Returns { data: [], pagination: {} }
  enqueueJob: (data) => fetch(`${API_URL}/job-queue`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleJSON),
  listQueueJobs: (params) => fetch(`${API_URL}/job-queue?${new URLSearchParams(params || {})}`, { headers: getHeaders() }).then(handleJSON),
  getQueueJob: (id) => fetch(`${API_URL}/job-queue/${id}`, { headers: getHeaders() }).then(handleJSON),
  cancelQueueJob: (id) => fetch(`${API_URL}/job-queue/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleJSON),

  // ── Exports ──────────────────────────────────────────────────────────
  exportJobsUrl: (params) => `${API_URL}/export/jobs?${new URLSearchParams(params || {})}`,
  exportDataUrl: (params) => `${API_URL}/export/data?${new URLSearchParams(params || {})}`,
  exportFile: async (url, filename) => {
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = filename; a.click();
    URL.revokeObjectURL(u);
  },
};

export default api;
