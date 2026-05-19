import React, { useEffect, useState } from 'react';

const API = (typeof window !== 'undefined' && window.location.port === '3600'
  ? 'http://localhost:3500'
  : 'http://localhost:3001') + '/api/custom-views';

export default function SuccessRateChart() {
  const [rows, setRows] = useState([]);
  const [overall, setOverall] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/success-rate`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setRows(d.rows || []);
        setOverall(d.overall_success_rate || 0);
        setLoading(false);
      })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, []);

  if (loading) return <div style={{ color: '#a0a0b0' }}>Loading success rates...</div>;
  if (err) return <div style={{ color: '#e94560' }}>Error: {err}</div>;

  return (
    <div
      data-testid="success-rate-chart"
      style={{ background: '#16213e', padding: 20, borderRadius: 8, border: '1px solid #0f3460' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ color: '#e94560', marginTop: 0 }}>Success Rate by Domain</h3>
        <div style={{ color: '#27ae60', fontSize: 24, fontWeight: 'bold' }}>{overall}%</div>
      </div>
      <div style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 12 }}>
        {rows.length} domains, aggregated across jobs
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => {
          const color =
            r.success_rate >= 95 ? '#27ae60'
              : r.success_rate >= 80 ? '#f39c12'
              : '#e94560';
          return (
            <div key={r.domain} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{ width: 170, color: '#fff', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={`${r.jobs} job(s)`}
              >
                {r.domain}
              </div>
              <div style={{ flex: 1, height: 14, background: '#0f3460', borderRadius: 3 }}>
                <div style={{ width: `${r.success_rate}%`, height: '100%', background: color, borderRadius: 3 }} />
              </div>
              <div style={{ width: 60, color: '#fff', fontSize: 12, textAlign: 'right' }}>
                {r.success_rate}%
              </div>
              <div style={{ width: 96, color: '#a0a0b0', fontSize: 11, textAlign: 'right' }}>
                {r.total_runs} runs
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
