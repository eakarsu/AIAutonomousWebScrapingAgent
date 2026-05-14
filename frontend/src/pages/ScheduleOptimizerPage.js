import React, { useState, useEffect } from 'react';
import api from '../services/api';

/**
 * Schedule Conflict Detection.
 * POST /api/agents/schedule-optimizer { jobs: [...] }
 * Pre-fills with the user's existing jobs so they can run optimization with one click.
 */
export default function ScheduleOptimizerPage() {
  const [jobs, setJobs] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { api.getJobs().then(setJobs).catch((e) => setError(e.message)); }, []);

  const optimize = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const payload = jobs.map((j) => ({
        id: j.id, name: j.name, url: j.url, schedule: j.schedule,
        last_run_at: j.last_run_at, avg_duration_s: j.avg_duration_s,
      }));
      const data = await api.scheduleOptimizer(payload);
      setResult(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const s = {
    page: { padding: 30 },
    title: { color: '#e0e0e0', fontSize: 24, marginBottom: 20 },
    btn: { padding: '12px 24px', background: '#e94560', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', marginBottom: 20 },
    card: { background: '#16213e', border: '1px solid #0f3460', borderRadius: 12, padding: 20, marginBottom: 16 },
    label: { color: '#e94560', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 },
    code: { background: '#1a1a2e', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', color: '#fbbf24' },
    sev: (s) => ({
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 'bold',
      background: s === 'Critical' || s === 'High' ? '#e9456020' : s === 'Medium' ? '#f39c1220' : '#2ecc7120',
      color: s === 'Critical' || s === 'High' ? '#e94560' : s === 'Medium' ? '#f39c12' : '#2ecc71',
    }),
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>📅 Schedule Optimizer</h1>
      <p style={{ color: '#a0a0b0', marginBottom: 20 }}>
        AI analyzes your {jobs.length} scraping jobs for schedule conflicts and recommends optimized cron expressions.
      </p>
      <button style={s.btn} onClick={optimize} disabled={loading || jobs.length === 0}>
        {loading ? '⏳ Optimizing…' : '🤖 Run Schedule Optimizer'}
      </button>

      {error && <div style={{ color: '#e94560', marginBottom: 16 }}>{error}</div>}

      {result && (
        <>
          <div style={s.card}>
            <div style={s.label}>Summary</div>
            <div style={{ color: '#e0e0e0' }}>{result.summary || '—'}</div>
            <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
              <div><strong style={{ color: '#fbbf24' }}>{result.total_jobs}</strong> total jobs</div>
              <div><strong style={{ color: result.conflicts_found > 0 ? '#e94560' : '#2ecc71' }}>{result.conflicts_found}</strong> conflicts</div>
              {result.load_distribution_score && (
                <div>Load score: <strong style={{ color: '#2ecc71' }}>{result.load_distribution_score.before} → {result.load_distribution_score.after}</strong></div>
              )}
            </div>
          </div>

          {result.conflict_details?.length > 0 && (
            <div style={s.card}>
              <div style={s.label}>⚠️ Conflicts</div>
              {result.conflict_details.map((c, i) => (
                <div key={i} style={{ marginBottom: 12, padding: 12, background: '#1a1a2e', borderRadius: 6, borderLeft: '3px solid #e94560' }}>
                  <div style={{ color: '#e94560', fontWeight: 'bold' }}>{c.conflict_type} · Jobs {(c.job_ids || []).join(', ')}</div>
                  <div style={{ color: '#e0e0e0', marginTop: 4 }}>{c.description}</div>
                </div>
              ))}
            </div>
          )}

          {result.optimized_schedule?.length > 0 && (
            <div style={s.card}>
              <div style={s.label}>📆 Recommended Schedule</div>
              <table style={{ width: '100%', color: '#e0e0e0', fontSize: 14 }}>
                <thead><tr style={{ borderBottom: '1px solid #0f3460' }}>
                  <th style={{ textAlign: 'left', padding: 8, color: '#a0a0b0' }}>Job</th>
                  <th style={{ textAlign: 'left', padding: 8, color: '#a0a0b0' }}>Current</th>
                  <th style={{ textAlign: 'left', padding: 8, color: '#a0a0b0' }}>Recommended</th>
                  <th style={{ textAlign: 'left', padding: 8, color: '#a0a0b0' }}>Reason</th>
                </tr></thead>
                <tbody>
                  {result.optimized_schedule.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #0f346030' }}>
                      <td style={{ padding: 8 }}>{r.job_name}</td>
                      <td style={{ padding: 8 }}><code style={s.code}>{r.current_cron}</code></td>
                      <td style={{ padding: 8 }}><code style={s.code}>{r.recommended_cron}</code></td>
                      <td style={{ padding: 8, color: '#a0a0b0' }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.optimal_windows?.length > 0 && (
            <div style={s.card}>
              <div style={s.label}>🕐 Optimal Time Windows</div>
              {result.optimal_windows.map((w, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#fbbf24' }}>{w.window}</strong> — {w.recommended_job_count} jobs · <span style={{ color: '#a0a0b0' }}>{w.reason}</span>
                </div>
              ))}
            </div>
          )}

          {result.warnings?.length > 0 && (
            <div style={s.card}>
              <div style={s.label}>⚠️ Warnings</div>
              {result.warnings.map((w, i) => <div key={i} style={{ color: '#f39c12' }}>• {w}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
