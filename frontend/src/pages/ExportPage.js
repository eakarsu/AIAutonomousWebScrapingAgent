import React, { useState, useEffect } from 'react';
import api from '../services/api';

/**
 * CSV Export Hub.
 * GET /api/export/jobs?status=&search=
 * GET /api/export/data?job_id=&search=
 */
export default function ExportPage() {
  const [jobs, setJobs] = useState([]);
  const [jobFilter, setJobFilter] = useState({ status: '', search: '' });
  const [dataFilter, setDataFilter] = useState({ job_id: '', search: '' });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { api.getJobs().then(setJobs).catch(() => {}); }, []);

  const downloadJobs = async () => {
    setBusy('jobs'); setError(null);
    try {
      const params = {};
      if (jobFilter.status) params.status = jobFilter.status;
      if (jobFilter.search) params.search = jobFilter.search;
      await api.exportFile(api.exportJobsUrl(params), `scraping-jobs-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { setError(e.message); }
    setBusy(null);
  };

  const downloadData = async () => {
    setBusy('data'); setError(null);
    try {
      const params = {};
      if (dataFilter.job_id) params.job_id = dataFilter.job_id;
      if (dataFilter.search) params.search = dataFilter.search;
      await api.exportFile(api.exportDataUrl(params), `scraped-data-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { setError(e.message); }
    setBusy(null);
  };

  const s = {
    page: { padding: 30 },
    title: { color: '#e0e0e0', fontSize: 24, marginBottom: 4 },
    sub: { color: '#a0a0b0', marginBottom: 20 },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
    card: { background: '#16213e', border: '1px solid #0f3460', borderRadius: 12, padding: 20 },
    h3: { color: '#e94560', marginBottom: 12 },
    label: { color: '#a0a0b0', fontSize: 12, marginBottom: 4, display: 'block', textTransform: 'uppercase' },
    input: { width: '100%', padding: 10, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 6, color: '#e0e0e0', marginBottom: 12 },
    btn: { padding: '12px 20px', background: '#e94560', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' },
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>📤 CSV Export</h1>
      <p style={s.sub}>Download scraping jobs or scraped data as filtered CSV files.</p>

      {error && <div style={{ color: '#e94560', marginBottom: 16 }}>{error}</div>}

      <div style={s.grid}>
        <div style={s.card}>
          <h3 style={s.h3}>Export Scraping Jobs</h3>
          <label style={s.label}>Status filter</label>
          <select style={s.input} value={jobFilter.status} onChange={(e) => setJobFilter({ ...jobFilter, status: e.target.value })}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="error">Error</option>
          </select>
          <label style={s.label}>Search (name or URL)</label>
          <input style={s.input} value={jobFilter.search} onChange={(e) => setJobFilter({ ...jobFilter, search: e.target.value })} placeholder="keyword" />
          <button style={s.btn} onClick={downloadJobs} disabled={busy === 'jobs'}>
            {busy === 'jobs' ? '⏳ Exporting…' : '⬇ Download Jobs CSV'}
          </button>
        </div>

        <div style={s.card}>
          <h3 style={s.h3}>Export Scraped Data</h3>
          <label style={s.label}>Filter by job</label>
          <select style={s.input} value={dataFilter.job_id} onChange={(e) => setDataFilter({ ...dataFilter, job_id: e.target.value })}>
            <option value="">All jobs</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <label style={s.label}>Search inside data JSON</label>
          <input style={s.input} value={dataFilter.search} onChange={(e) => setDataFilter({ ...dataFilter, search: e.target.value })} placeholder="keyword" />
          <button style={s.btn} onClick={downloadData} disabled={busy === 'data'}>
            {busy === 'data' ? '⏳ Exporting…' : '⬇ Download Data CSV'}
          </button>
        </div>
      </div>
    </div>
  );
}
