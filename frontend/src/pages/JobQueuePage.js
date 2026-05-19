import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';

/**
 * Async Job Queue.
 * - Enqueue a job (scrape_url, analyze_url, run_competitive_agent)
 * - Poll the queue every 3s for status updates
 * - Cancel pending jobs
 * - View result JSON
 */
export default function JobQueuePage() {
  const [queue, setQueue] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ job_type: 'scrape_url', url: '', instruction: '', schema: '', description: '', agent_id: '' });
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const load = async () => {
    try {
      const data = await api.listQueueJobs(statusFilter ? { status: statusFilter } : {});
      setQueue(Array.isArray(data) ? data : []);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 3000);
    return () => clearInterval(pollRef.current);
  }, [statusFilter]);

  const enqueue = async () => {
    setError(null);
    let payload = {};
    try {
      if (form.job_type === 'scrape_url') {
        payload = { url: form.url, instruction: form.instruction, schema: form.schema ? JSON.parse(form.schema) : undefined };
      } else if (form.job_type === 'analyze_url') {
        payload = { url: form.url, description: form.description };
      } else if (form.job_type === 'run_competitive_agent') {
        payload = { agent_id: parseInt(form.agent_id, 10) };
      }
      await api.enqueueJob({ job_type: form.job_type, payload });
      setShowCreate(false);
      load();
    } catch (e) { setError(e.message); }
  };

  const cancel = async (id) => {
    if (!window.confirm('Cancel this pending job?')) return;
    try { await api.cancelQueueJob(id); load(); } catch (e) { setError(e.message); }
  };

  const s = {
    page: { padding: 30 },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { color: '#e0e0e0', fontSize: 24 },
    btn: { padding: '10px 20px', background: '#e94560', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' },
    table: { width: '100%', borderCollapse: 'collapse', background: '#16213e', borderRadius: 12, overflow: 'hidden' },
    th: { padding: '12px 16px', textAlign: 'left', background: '#0f3460', color: '#a0a0b0', fontSize: 12, textTransform: 'uppercase' },
    td: { padding: '12px 16px', borderBottom: '1px solid #0f346030', fontSize: 14, color: '#e0e0e0' },
    status: (st) => ({
      padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 'bold',
      background: st === 'completed' ? '#2ecc7120' : st === 'failed' ? '#e9456020' : st === 'running' ? '#f39c1220' : '#3498db20',
      color: st === 'completed' ? '#2ecc71' : st === 'failed' ? '#e94560' : st === 'running' ? '#f39c12' : '#3498db',
    }),
    select: { padding: 8, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 8, color: '#e0e0e0' },
    input: { width: '100%', padding: 10, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 8, color: '#e0e0e0', marginBottom: 12 },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modalContent: { background: '#16213e', padding: 24, borderRadius: 12, width: 500, maxHeight: '80vh', overflow: 'auto' },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>⚙️ Async Job Queue</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <select style={s.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button style={s.btn} onClick={() => setShowCreate(true)}>+ Enqueue Job</button>
        </div>
      </div>

      {error && <div style={{ color: '#e94560', marginBottom: 16 }}>{error}</div>}

      <table style={s.table}>
        <thead><tr><th style={s.th}>ID</th><th style={s.th}>Type</th><th style={s.th}>Status</th><th style={s.th}>Created</th><th style={s.th}>Started</th><th style={s.th}>Completed</th><th style={s.th}>Actions</th></tr></thead>
        <tbody>
          {queue.length === 0 && <tr><td colSpan="7" style={{ ...s.td, textAlign: 'center', color: '#a0a0b0' }}>No jobs in queue</td></tr>}
          {queue.map((j) => (
            <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(j)}>
              <td style={s.td}>#{j.id}</td>
              <td style={s.td}><code style={{ background: '#1a1a2e', padding: '2px 6px', borderRadius: 4 }}>{j.job_type}</code></td>
              <td style={s.td}><span style={s.status(j.status)}>{j.status}</span></td>
              <td style={s.td}>{new Date(j.created_at).toLocaleString()}</td>
              <td style={s.td}>{j.started_at ? new Date(j.started_at).toLocaleTimeString() : '-'}</td>
              <td style={s.td}>{j.completed_at ? new Date(j.completed_at).toLocaleTimeString() : '-'}</td>
              <td style={s.td}>
                {j.status === 'pending' && <button style={{ ...s.btn, padding: '4px 10px' }} onClick={(e) => { e.stopPropagation(); cancel(j.id); }}>Cancel</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showCreate && (
        <div style={s.modal} onClick={() => setShowCreate(false)}>
          <div style={s.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#e94560', marginBottom: 16 }}>Enqueue Job</h2>
            <label style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 4, display: 'block' }}>Job Type</label>
            <select style={{ ...s.select, width: '100%', marginBottom: 12 }} value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })}>
              <option value="scrape_url">scrape_url</option>
              <option value="analyze_url">analyze_url</option>
              <option value="run_competitive_agent">run_competitive_agent</option>
            </select>

            {(form.job_type === 'scrape_url' || form.job_type === 'analyze_url') && (
              <>
                <label style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 4, display: 'block' }}>URL</label>
                <input style={s.input} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com" />
              </>
            )}
            {form.job_type === 'scrape_url' && (
              <>
                <label style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 4, display: 'block' }}>Instruction</label>
                <input style={s.input} value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} placeholder="Extract product names and prices" />
                <label style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 4, display: 'block' }}>Schema (optional JSON)</label>
                <input style={s.input} value={form.schema} onChange={(e) => setForm({ ...form, schema: e.target.value })} placeholder='{"name":"string","price":"number"}' />
              </>
            )}
            {form.job_type === 'analyze_url' && (
              <>
                <label style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 4, display: 'block' }}>Description</label>
                <input style={s.input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </>
            )}
            {form.job_type === 'run_competitive_agent' && (
              <>
                <label style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 4, display: 'block' }}>Competitive Agent ID</label>
                <input style={s.input} type="number" value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })} />
              </>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={{ ...s.btn, background: '#0f3460' }} onClick={() => setShowCreate(false)}>Cancel</button>
              <button style={s.btn} onClick={enqueue}>Enqueue</button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div style={s.modal} onClick={() => setSelected(null)}>
          <div style={{ ...s.modalContent, width: 700 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#e94560', marginBottom: 16 }}>Job #{selected.id} Details</h2>
            <div style={{ marginBottom: 12 }}><strong style={{ color: '#a0a0b0' }}>Type:</strong> <code>{selected.job_type}</code></div>
            <div style={{ marginBottom: 12 }}><strong style={{ color: '#a0a0b0' }}>Status:</strong> <span style={s.status(selected.status)}>{selected.status}</span></div>
            <div style={{ marginBottom: 12 }}>
              <strong style={{ color: '#a0a0b0' }}>Payload:</strong>
              <pre style={{ background: '#1a1a2e', padding: 12, borderRadius: 8, color: '#e0e0e0', overflow: 'auto', fontSize: 12 }}>{JSON.stringify(selected.payload, null, 2)}</pre>
            </div>
            {selected.result && (
              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: '#a0a0b0' }}>Result:</strong>
                <pre style={{ background: '#1a1a2e', padding: 12, borderRadius: 8, color: '#2ecc71', overflow: 'auto', fontSize: 12, maxHeight: 400 }}>{JSON.stringify(selected.result, null, 2)}</pre>
              </div>
            )}
            {selected.error_message && (
              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: '#e94560' }}>Error:</strong> {selected.error_message}
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <button style={s.btn} onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
