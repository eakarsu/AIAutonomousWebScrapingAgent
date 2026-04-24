import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalJobs: 0, activeJobs: 0, dataCollected: 0, errors: 0 });
  const [recentJobs, setRecentJobs] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error);
    api.getJobs().then(jobs => setRecentJobs(jobs.slice(0, 5))).catch(console.error);
  }, []);

  const cards = [
    { label: 'Total Jobs', value: stats.totalJobs, icon: '📋', color: '#3498db', path: '/jobs' },
    { label: 'Active Scrapers', value: stats.activeJobs, icon: '🔄', color: '#2ecc71', path: '/jobs' },
    { label: 'Data Collected', value: stats.dataCollected?.toLocaleString(), icon: '📦', color: '#e94560', path: '/data' },
    { label: 'Errors', value: stats.errors, icon: '⚠️', color: '#e67e22', path: '/logs' },
  ];

  const s = {
    page: { padding: '30px' },
    title: { fontSize: '24px', color: '#e0e0e0', marginBottom: '24px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' },
    card: (color) => ({ background: '#16213e', borderRadius: '12px', padding: '24px', cursor: 'pointer', border: '1px solid #0f3460', borderLeft: `4px solid ${color}`, transition: 'transform 0.2s, box-shadow 0.2s' }),
    cardLabel: { color: '#a0a0b0', fontSize: '13px', marginBottom: '8px' },
    cardValue: { fontSize: '28px', fontWeight: 'bold', color: '#e0e0e0' },
    cardIcon: { fontSize: '24px', float: 'right' },
    table: { width: '100%', borderCollapse: 'collapse', background: '#16213e', borderRadius: '12px', overflow: 'hidden' },
    th: { padding: '12px 16px', textAlign: 'left', background: '#0f3460', color: '#a0a0b0', fontSize: '12px', textTransform: 'uppercase' },
    td: { padding: '12px 16px', borderBottom: '1px solid #0f346030', fontSize: '14px' },
    status: (s) => ({ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold',
      background: s === 'active' ? '#2ecc7120' : s === 'paused' ? '#f39c1220' : '#e9456020',
      color: s === 'active' ? '#2ecc71' : s === 'paused' ? '#f39c12' : '#e94560' }),
    section: { marginBottom: '20px' },
    sectionTitle: { fontSize: '18px', color: '#e0e0e0', marginBottom: '16px' }
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>Dashboard</h1>
      <div style={s.grid}>
        {cards.map((card, i) => (
          <div key={i} style={s.card(card.color)} onClick={() => navigate(card.path)}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
            <span style={s.cardIcon}>{card.icon}</span>
            <div style={s.cardLabel}>{card.label}</div>
            <div style={s.cardValue}>{card.value}</div>
          </div>
        ))}
      </div>
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Recent Jobs</h2>
        <table style={s.table}>
          <thead><tr><th style={s.th}>Name</th><th style={s.th}>URL</th><th style={s.th}>Status</th><th style={s.th}>Runs</th><th style={s.th}>Data</th></tr></thead>
          <tbody>
            {recentJobs.map(job => (
              <tr key={job.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/jobs')}
                onMouseEnter={e => e.currentTarget.style.background = '#0f346020'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={s.td}>{job.name}</td>
                <td style={{...s.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{job.url}</td>
                <td style={s.td}><span style={s.status(job.status)}>{job.status}</span></td>
                <td style={s.td}>{job.total_runs}</td>
                <td style={s.td}>{job.data_collected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
