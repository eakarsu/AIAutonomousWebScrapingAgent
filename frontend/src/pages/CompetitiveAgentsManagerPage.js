import React, { useState, useEffect } from 'react';
import api from '../services/api';

/**
 * Competitive Agents Manager (CRUD + Run + Results).
 * Uses the new /api/competitive-agents/* CRUD endpoints (not the legacy analyze endpoints).
 */
export default function CompetitiveAgentsManagerPage() {
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [running, setRunning] = useState(false);
  const [latestRun, setLatestRun] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', target_urls: '', frequency: 'daily', analysis_type: 'general' });

  const load = async () => {
    try { setAgents(await api.listCompetitiveAgents() || []); } catch (e) { setError(e.message); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selected) return;
    api.competitiveAgentResults(selected.id, { page: 1, limit: 20 })
      .then((r) => setResults(r.results || []))
      .catch((e) => setError(e.message));
  }, [selected]);

  const submit = async () => {
    setError(null);
    const payload = {
      name: form.name,
      target_urls: form.target_urls.split('\n').map((u) => u.trim()).filter(Boolean),
      frequency: form.frequency,
      analysis_type: form.analysis_type,
    };
    try {
      if (editing) await api.updateCompetitiveAgent(editing.id, payload);
      else await api.createCompetitiveAgent(payload);
      setShowCreate(false); setEditing(null); setForm({ name: '', target_urls: '', frequency: 'daily', analysis_type: 'general' });
      load();
    } catch (e) { setError(e.message); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this agent?')) return;
    try { await api.deleteCompetitiveAgent(id); if (selected?.id === id) setSelected(null); load(); } catch (e) { setError(e.message); }
  };

  const run = async (id) => {
    setRunning(true); setError(null); setLatestRun(null);
    try { setLatestRun(await api.runCompetitiveAgent(id)); load(); }
    catch (e) { setError(e.message); }
    finally { setRunning(false); }
  };

  const startEdit = (agent) => {
    setEditing(agent);
    setForm({
      name: agent.name,
      target_urls: (agent.target_urls || []).join('\n'),
      frequency: agent.frequency,
      analysis_type: agent.analysis_type,
    });
    setShowCreate(true);
  };

  const s = {
    page: { padding: 30 },
    title: { color: '#e0e0e0', fontSize: 24, marginBottom: 4 },
    sub: { color: '#a0a0b0', marginBottom: 20 },
    grid: { display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 },
    card: { background: '#16213e', border: '1px solid #0f3460', borderRadius: 12, padding: 16 },
    btn: { padding: '8px 14px', background: '#e94560', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 },
    btnSec: { padding: '8px 14px', background: '#0f3460', color: '#e0e0e0', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 },
    item: (active) => ({
      padding: 12, marginBottom: 8, borderRadius: 8, cursor: 'pointer',
      background: active ? '#0f3460' : '#1a1a2e',
      borderLeft: active ? '3px solid #e94560' : '3px solid transparent',
    }),
    label: { color: '#a0a0b0', fontSize: 12, marginBottom: 4, display: 'block', textTransform: 'uppercase' },
    input: { width: '100%', padding: 10, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 6, color: '#e0e0e0', marginBottom: 12 },
    textarea: { width: '100%', padding: 10, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 6, color: '#e0e0e0', minHeight: 100, fontFamily: 'monospace', fontSize: 12, marginBottom: 12 },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modalContent: { background: '#16213e', padding: 24, borderRadius: 12, width: 500 },
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>🏆 Competitive Agents Manager</h1>
      <p style={s.sub}>Create persistent competitive intelligence agents that scrape and analyze competitor URLs on a schedule.</p>

      {error && <div style={{ color: '#e94560', marginBottom: 16 }}>{error}</div>}

      <div style={{ marginBottom: 16 }}>
        <button style={s.btn} onClick={() => { setEditing(null); setForm({ name: '', target_urls: '', frequency: 'daily', analysis_type: 'general' }); setShowCreate(true); }}>+ New Agent</button>
      </div>

      <div style={s.grid}>
        <div style={s.card}>
          <h3 style={{ color: '#a0a0b0', marginBottom: 12 }}>Agents ({agents.length})</h3>
          {agents.length === 0 && <div style={{ color: '#a0a0b0' }}>No agents yet</div>}
          {agents.map((a) => (
            <div key={a.id} style={s.item(selected?.id === a.id)} onClick={() => setSelected(a)}>
              <div style={{ fontWeight: 'bold', color: '#e0e0e0' }}>{a.name}</div>
              <div style={{ fontSize: 12, color: '#a0a0b0' }}>{a.analysis_type} · {a.frequency}</div>
              <div style={{ fontSize: 12, color: '#a0a0b0' }}>{(a.target_urls || []).length} URLs · {a.result_count || 0} runs</div>
              <div style={{ fontSize: 11, color: a.status === 'active' ? '#2ecc71' : '#a0a0b0' }}>● {a.status}</div>
            </div>
          ))}
        </div>

        <div>
          {!selected && <div style={{ ...s.card, color: '#a0a0b0', textAlign: 'center', padding: 40 }}>Select an agent to view details</div>}
          {selected && (
            <>
              <div style={{ ...s.card, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h2 style={{ color: '#e0e0e0', marginBottom: 4 }}>{selected.name}</h2>
                    <div style={{ color: '#a0a0b0', fontSize: 13 }}>{selected.analysis_type} · {selected.frequency} · {selected.status}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={s.btn} onClick={() => run(selected.id)} disabled={running}>{running ? '⏳' : '▶'} Run Now</button>
                    <button style={s.btnSec} onClick={() => startEdit(selected)}>Edit</button>
                    <button style={s.btnSec} onClick={() => remove(selected.id)}>Delete</button>
                  </div>
                </div>
                <div>
                  <div style={s.label}>Target URLs</div>
                  {(selected.target_urls || []).map((u, i) => (
                    <div key={i} style={{ background: '#1a1a2e', padding: 8, borderRadius: 4, marginBottom: 4, color: '#e0e0e0', fontSize: 13, wordBreak: 'break-all' }}>{u}</div>
                  ))}
                </div>
                <div style={{ marginTop: 12, color: '#a0a0b0', fontSize: 12 }}>
                  Last run: {selected.last_run_at ? new Date(selected.last_run_at).toLocaleString() : 'Never'} ·
                  Next: {selected.next_run_at ? new Date(selected.next_run_at).toLocaleString() : '-'}
                </div>
              </div>

              {latestRun && (
                <div style={{ ...s.card, marginBottom: 16 }}>
                  <h3 style={{ color: '#e94560' }}>🤖 Latest Run Analysis</h3>
                  <pre style={{ background: '#1a1a2e', padding: 12, borderRadius: 8, color: '#e0e0e0', overflow: 'auto', fontSize: 12, maxHeight: 360 }}>
                    {JSON.stringify(latestRun.analysis, null, 2)}
                  </pre>
                </div>
              )}

              <div style={s.card}>
                <h3 style={{ color: '#a0a0b0', marginBottom: 12 }}>Run History ({results.length})</h3>
                {results.length === 0 && <div style={{ color: '#a0a0b0' }}>No runs yet</div>}
                {results.map((r) => (
                  <div key={r.id} style={{ background: '#1a1a2e', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong style={{ color: '#fbbf24' }}>Run #{r.id}</strong>
                      <span style={{ color: r.status === 'failed' ? '#e94560' : '#2ecc71' }}>{r.status}</span>
                    </div>
                    <div style={{ color: '#a0a0b0', fontSize: 12 }}>{new Date(r.run_at).toLocaleString()}</div>
                    {r.error_message && <div style={{ color: '#e94560', fontSize: 12, marginTop: 4 }}>{r.error_message}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <div style={s.modal} onClick={() => setShowCreate(false)}>
          <div style={s.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#e94560', marginBottom: 16 }}>{editing ? 'Edit' : 'New'} Competitive Agent</h2>
            <label style={s.label}>Name</label>
            <input style={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label style={s.label}>Target URLs (one per line)</label>
            <textarea style={s.textarea} value={form.target_urls} onChange={(e) => setForm({ ...form, target_urls: e.target.value })}
              placeholder="https://competitor1.com&#10;https://competitor2.com" />
            <label style={s.label}>Frequency</label>
            <select style={s.input} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <label style={s.label}>Analysis Type</label>
            <select style={s.input} value={form.analysis_type} onChange={(e) => setForm({ ...form, analysis_type: e.target.value })}>
              <option value="general">General</option>
              <option value="pricing">Pricing</option>
              <option value="technology">Technology Stack</option>
              <option value="content">Content Strategy</option>
              <option value="seo">SEO</option>
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={s.btnSec} onClick={() => setShowCreate(false)}>Cancel</button>
              <button style={s.btn} onClick={submit}>{editing ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
