import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailPanel from '../components/DetailPanel';

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', selectors: '{}', schedule: '0 */6 * * *', status: 'active' });
  const [editing, setEditing] = useState(false);

  useEffect(() => { loadJobs(); }, []);
  const loadJobs = () => api.getJobs().then(setJobs).catch(console.error);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = { ...form, selectors: JSON.parse(form.selectors || '{}') };
    if (editing) await api.updateJob(selected.id, data);
    else await api.createJob(data);
    setShowModal(false); setEditing(false); setForm({ name: '', url: '', selectors: '{}', schedule: '0 */6 * * *', status: 'active' });
    loadJobs();
  };

  const handleEdit = () => {
    setForm({ name: selected.name, url: selected.url, selectors: JSON.stringify(selected.selectors || {}), schedule: selected.schedule, status: selected.status });
    setEditing(true); setShowModal(true); setSelected(null);
  };

  const handleDelete = async () => {
    if (window.confirm('Delete this job?')) { await api.deleteJob(selected.id); setSelected(null); loadJobs(); }
  };

  const s = {
    page: { padding: '30px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
    title: { fontSize: '24px', color: '#e0e0e0' },
    addBtn: { padding: '10px 20px', background: '#e94560', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
    table: { width: '100%', borderCollapse: 'collapse', background: '#16213e', borderRadius: '12px', overflow: 'hidden' },
    th: { padding: '12px 16px', textAlign: 'left', background: '#0f3460', color: '#a0a0b0', fontSize: '12px', textTransform: 'uppercase' },
    td: { padding: '12px 16px', borderBottom: '1px solid #0f346030', fontSize: '14px', color: '#e0e0e0' },
    status: (st) => ({ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold',
      background: st === 'active' ? '#2ecc7120' : st === 'paused' ? '#f39c1220' : '#e9456020',
      color: st === 'active' ? '#2ecc71' : st === 'paused' ? '#f39c12' : '#e94560' }),
    input: { width: '100%', padding: '10px 14px', background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: '8px', color: '#e0e0e0', fontSize: '14px', marginBottom: '12px', outline: 'none' },
    label: { color: '#a0a0b0', fontSize: '12px', marginBottom: '4px', display: 'block' },
    submitBtn: { width: '100%', padding: '12px', background: '#e94560', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', marginTop: '8px' },
    detailRow: { marginBottom: '16px' },
    detailLabel: { color: '#a0a0b0', fontSize: '12px', marginBottom: '4px' },
    detailValue: { color: '#e0e0e0', fontSize: '14px', wordBreak: 'break-all' },
    btnRow: { display: 'flex', gap: '10px', marginTop: '20px' },
    editBtn: { flex: 1, padding: '10px', background: '#0f3460', color: '#e0e0e0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
    deleteBtn: { flex: 1, padding: '10px', background: '#e94560', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Scraping Jobs</h1>
        <button style={s.addBtn} onClick={() => { setEditing(false); setForm({ name: '', url: '', selectors: '{}', schedule: '0 */6 * * *', status: 'active' }); setShowModal(true); }}>+ New Job</button>
      </div>
      <table style={s.table}>
        <thead><tr><th style={s.th}>Name</th><th style={s.th}>URL</th><th style={s.th}>Schedule</th><th style={s.th}>Status</th><th style={s.th}>Runs</th><th style={s.th}>Data</th><th style={s.th}>Errors</th></tr></thead>
        <tbody>
          {jobs.map(job => (
            <tr key={job.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(job)}
              onMouseEnter={e => e.currentTarget.style.background = '#0f346020'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <td style={s.td}><strong>{job.name}</strong></td>
              <td style={{...s.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{job.url}</td>
              <td style={s.td}><code style={{background:'#1a1a2e',padding:'2px 6px',borderRadius:'4px',fontSize:'12px'}}>{job.schedule}</code></td>
              <td style={s.td}><span style={s.status(job.status)}>{job.status}</span></td>
              <td style={s.td}>{job.total_runs}</td>
              <td style={s.td}>{job.data_collected}</td>
              <td style={s.td}>{job.error_count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Job' : 'New Scraping Job'}>
        <form onSubmit={handleSubmit}>
          <label style={s.label}>Job Name</label>
          <input style={s.input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g., Amazon Product Prices" required />
          <label style={s.label}>Target URL</label>
          <input style={s.input} value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="https://example.com" required />
          <label style={s.label}>CSS Selectors (JSON)</label>
          <input style={s.input} value={form.selectors} onChange={e => setForm({...form, selectors: e.target.value})} placeholder='{"title": "h1", "price": ".price"}' />
          <label style={s.label}>Schedule (Cron)</label>
          <input style={s.input} value={form.schedule} onChange={e => setForm({...form, schedule: e.target.value})} placeholder="0 */6 * * *" />
          <label style={s.label}>Status</label>
          <select style={s.input} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
            <option value="active">Active</option><option value="paused">Paused</option>
          </select>
          <button style={s.submitBtn} type="submit">{editing ? 'Update Job' : 'Create Job'}</button>
        </form>
      </Modal>

      <DetailPanel isOpen={!!selected} onClose={() => setSelected(null)} title="Job Details">
        {selected && <>
          <div style={s.detailRow}><div style={s.detailLabel}>Name</div><div style={s.detailValue}>{selected.name}</div></div>
          <div style={s.detailRow}><div style={s.detailLabel}>URL</div><div style={s.detailValue}>{selected.url}</div></div>
          <div style={s.detailRow}><div style={s.detailLabel}>Schedule</div><div style={s.detailValue}><code>{selected.schedule}</code></div></div>
          <div style={s.detailRow}><div style={s.detailLabel}>Status</div><div style={s.detailValue}><span style={s.status(selected.status)}>{selected.status}</span></div></div>
          <div style={s.detailRow}><div style={s.detailLabel}>Total Runs</div><div style={s.detailValue}>{selected.total_runs}</div></div>
          <div style={s.detailRow}><div style={s.detailLabel}>Data Collected</div><div style={s.detailValue}>{selected.data_collected}</div></div>
          <div style={s.detailRow}><div style={s.detailLabel}>Errors</div><div style={s.detailValue}>{selected.error_count}</div></div>
          <div style={s.detailRow}><div style={s.detailLabel}>Selectors</div><div style={s.detailValue}><pre style={{background:'#1a1a2e',padding:'10px',borderRadius:'8px',fontSize:'12px',overflow:'auto'}}>{JSON.stringify(selected.selectors, null, 2)}</pre></div></div>
          <div style={s.detailRow}><div style={s.detailLabel}>Last Run</div><div style={s.detailValue}>{selected.last_run ? new Date(selected.last_run).toLocaleString() : 'Never'}</div></div>
          <div style={s.btnRow}>
            <button style={s.editBtn} onClick={handleEdit}>✏️ Edit</button>
            <button style={s.deleteBtn} onClick={handleDelete}>🗑️ Delete</button>
          </div>
        </>}
      </DetailPanel>
    </div>
  );
}
