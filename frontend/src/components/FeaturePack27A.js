import React, { useCallback, useEffect, useState } from 'react';

export function AiResultSections({ value, label = 'Result' }) {
  if (value === null || value === undefined || value === '') return <div><strong>{label}:</strong> (empty)</div>;
  if (Array.isArray(value)) return <div><strong>{label}:</strong>{value.length === 0 ? ' (empty)' : <ul>{value.map((v, i) => <li key={i}><AiResultSections value={v} label={`Item ${i + 1}`} /></li>)}</ul>}</div>;
  if (typeof value === 'object') return <div><strong>{label}</strong>{Object.entries(value).map(([k, v]) => <div key={k} style={{ marginLeft: 12 }}><AiResultSections value={v} label={k} /></div>)}</div>;
  return <div><strong>{label}:</strong> {String(value)}</div>;
}

const FEATURES = [
  { id: 'job-health-summary', label: 'Job health summary' },
  { id: 'extraction-quality-summary', label: 'Extraction quality summary' },
  { id: 'crawl-schedule-priority', label: 'Crawl schedule priority' },
];

export default function FeaturePack27A({ title = 'Scraping jobs — tasks, export & AI' }) {
  const [tasks, setTasks] = useState([]); const [titleInput, setTitleInput] = useState('');
  const [search, setSearch] = useState(''); const [ai, setAi] = useState(null); const [error, setError] = useState('');
  const headers = useCallback(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('authToken') || ''}` }), []);
  const load = useCallback(async () => {
    try { const r = await fetch(`/api/feature-pack/tasks?search=${encodeURIComponent(search)}`, { headers: headers() }); if (!r.ok) throw new Error(`Tasks ${r.status}`); setTasks((await r.json()).data || []); } catch (e) { setError(e.message); }
  }, [headers, search]);
  useEffect(() => { load(); }, [load]);
  const create = async () => { const r = await fetch('/api/feature-pack/tasks', { method: 'POST', headers: headers(), body: JSON.stringify({ title: titleInput }) }); if (r.ok) { setTitleInput(''); load(); } else setError('Task create failed'); };
  const update = async (t, status) => { await fetch(`/api/feature-pack/tasks/${t.id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ status }) }); load(); };
  const download = async (format) => {
    const r = await fetch(`/api/feature-pack/records/export?format=${format}&search=${encodeURIComponent(search)}`, { headers: headers() });
    const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `main-records.${format}`; a.click();
  };
  const runAi = async (id) => { const r = await fetch(`/api/feature-pack/ai/${id}`, { method: 'POST', headers: headers(), body: '{}' }); setAi(await r.json()); };
  return (
    <div style={{ padding: 20 }}>
      <h2>{title}</h2>
      {error && <p role="alert">{error}</p>}
      <section><h3>Tasks</h3>
        <input aria-label="Search tasks and records" placeholder="Search / filter" value={search} onChange={(e) => setSearch(e.target.value)} />
        <input aria-label="New task title" placeholder="New task title" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} />
        <button onClick={create}>Create task</button>
        <ul>{tasks.map((t) => <li key={t.id}>{t.title} — {t.status} <select aria-label={`Status for ${t.title}`} value={t.status} onChange={(e) => update(t, e.target.value)}><option>todo</option><option>in_progress</option><option>done</option></select></li>)}</ul>
      </section>
      <section><h3>Export main records</h3><button onClick={() => download('csv')}>Export CSV</button> <button onClick={() => download('json')}>Export JSON</button></section>
      <section><h3>AI over main records</h3>
        {FEATURES.map((f) => <button key={f.id} onClick={() => runAi(f.id)}>{f.label}</button>)}
        {ai && <div><p>{ai.aiGenerated ? `AI generated (${ai.provider || 'provider'})` : 'Deterministic fallback (not AI generated)'} — aiGenerated: {String(ai.aiGenerated)}</p>{ai.note && <p>{ai.note}</p>}<AiResultSections value={ai.result} label="Analysis" /></div>}
      </section>
    </div>
  );
}
