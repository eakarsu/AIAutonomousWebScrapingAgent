import React, { useEffect, useState } from 'react';

const API = (typeof window !== 'undefined' && window.location.port === '3600'
  ? 'http://localhost:3500'
  : 'http://localhost:3001') + '/api/custom-views';

export default function ScrapeJobTimeline() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/timeline`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setEvents(d.events || []);
        setLoading(false);
      })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, []);

  if (loading) return <div style={{ color: '#a0a0b0' }}>Loading scrape timeline...</div>;
  if (err) return <div style={{ color: '#e94560' }}>Error: {err}</div>;

  const maxH = Math.max(48, ...events.map((e) => e.hours_ago || 0));

  return (
    <div
      data-testid="scrape-job-timeline"
      style={{ background: '#16213e', padding: 20, borderRadius: 8, border: '1px solid #0f3460' }}
    >
      <h3 style={{ color: '#e94560', marginTop: 0 }}>Scrape Job Timeline</h3>
      <div style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 12 }}>
        Recent scrape runs across {events.length} jobs (window: {maxH}h)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {events.slice(0, 18).map((ev) => {
          const pct = maxH > 0 ? ((maxH - ev.hours_ago) / maxH) * 100 : 0;
          const color =
            ev.status === 'active' ? '#27ae60'
              : ev.status === 'error' ? '#e94560'
              : '#f39c12';
          return (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                title={ev.domain}
                style={{ width: 170, color: '#fff', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {ev.name}
              </div>
              <div style={{ flex: 1, height: 18, background: '#0f3460', borderRadius: 3, position: 'relative' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
              </div>
              <div style={{ width: 80, color: '#a0a0b0', fontSize: 11, textAlign: 'right' }}>
                {ev.hours_ago}h ago
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
