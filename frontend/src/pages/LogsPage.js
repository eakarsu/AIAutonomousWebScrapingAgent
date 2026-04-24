import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState({ agent: '', status: '' });

  useEffect(() => { api.getLogs(filter).then(setLogs).catch(console.error); }, [filter]);

  const s = {
    page: { padding: '30px' },
    title: { fontSize: '24px', color: '#e0e0e0', marginBottom: '24px' },
    filters: { display: 'flex', gap: '10px', marginBottom: '20px' },
    select: { padding: '8px 12px', background: '#16213e', border: '1px solid #0f3460', borderRadius: '8px', color: '#e0e0e0', fontSize: '13px', outline: 'none' },
    table: { width: '100%', borderCollapse: 'collapse', background: '#16213e', borderRadius: '12px', overflow: 'hidden' },
    th: { padding: '12px 16px', textAlign: 'left', background: '#0f3460', color: '#a0a0b0', fontSize: '12px', textTransform: 'uppercase' },
    td: { padding: '10px 16px', borderBottom: '1px solid #0f346030', fontSize: '13px', color: '#e0e0e0' },
    badge: (s) => ({ padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
      background: s === 'success' ? '#2ecc7120' : s === 'error' ? '#e9456020' : '#3498db20',
      color: s === 'success' ? '#2ecc71' : s === 'error' ? '#e94560' : '#3498db' })
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>Agent Logs</h1>
      <div style={s.filters}>
        <select style={s.select} value={filter.agent} onChange={e => setFilter({...filter, agent: e.target.value})}>
          <option value="">All Agents</option>
          {['schedulerAgent','crawlerAgent','parserAgent','cleanerAgent','storageAgent'].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select style={s.select} value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})}>
          <option value="">All Status</option>
          <option value="success">Success</option><option value="error">Error</option><option value="info">Info</option>
        </select>
      </div>
      <table style={s.table}>
        <thead><tr><th style={s.th}>Time</th><th style={s.th}>Job</th><th style={s.th}>Agent</th><th style={s.th}>Action</th><th style={s.th}>Status</th><th style={s.th}>Message</th><th style={s.th}>Duration</th></tr></thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id}>
              <td style={s.td}>{new Date(log.created_at).toLocaleString()}</td>
              <td style={s.td}>{log.job_name || log.job_id}</td>
              <td style={s.td}><code style={{background:'#1a1a2e',padding:'2px 6px',borderRadius:'4px'}}>{log.agent}</code></td>
              <td style={s.td}>{log.action}</td>
              <td style={s.td}><span style={s.badge(log.status)}>{log.status}</span></td>
              <td style={{...s.td, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{log.message}</td>
              <td style={s.td}>{log.duration_ms ? `${log.duration_ms}ms` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
