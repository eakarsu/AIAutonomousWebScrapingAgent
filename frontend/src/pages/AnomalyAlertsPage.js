import React, { useState } from 'react';
import api from '../services/api';

/**
 * Data Anomaly Alerts.
 * POST /api/agents/anomaly-alerts { data_points, historical_avg }
 */
export default function AnomalyAlertsPage() {
  const [points, setPoints] = useState('[19.99, 20.49, 21.00, 19.75, 19.95, 89.50, 20.10, 19.80]');
  const [avg, setAvg] = useState('20.5');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const detect = async () => {
    setLoading(true); setError(null); setResult(null);
    let parsedPoints, parsedAvg;
    try { parsedPoints = JSON.parse(points); } catch { setError('data_points must be valid JSON'); setLoading(false); return; }
    try { parsedAvg = JSON.parse(avg); } catch { setError('historical_avg must be a valid number or JSON'); setLoading(false); return; }
    try {
      const data = await api.anomalyAlerts({ data_points: parsedPoints, historical_avg: parsedAvg });
      setResult(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const s = {
    page: { padding: 30 },
    title: { color: '#e0e0e0', fontSize: 24, marginBottom: 20 },
    card: { background: '#16213e', border: '1px solid #0f3460', borderRadius: 12, padding: 20, marginBottom: 16 },
    input: { width: '100%', padding: 10, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 8, color: '#e0e0e0', marginBottom: 12, fontFamily: 'monospace' },
    btn: { padding: '12px 24px', background: '#e94560', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' },
    label: { color: '#e94560', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 },
    sev: (sev) => ({
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 'bold',
      background: sev === 'Critical' || sev === 'High' ? '#e9456020' : sev === 'Medium' ? '#f39c1220' : '#2ecc7120',
      color: sev === 'Critical' || sev === 'High' ? '#e94560' : sev === 'Medium' ? '#f39c12' : '#2ecc71',
    }),
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>🚨 Anomaly Alerts</h1>
      <p style={{ color: '#a0a0b0', marginBottom: 20 }}>
        Detect outliers, spikes, drops, and missing values in scraped data using statistical and AI analysis.
      </p>

      <div style={s.card}>
        <div style={s.label}>Data Points (JSON array)</div>
        <input style={s.input} value={points} onChange={(e) => setPoints(e.target.value)} />
        <div style={s.label}>Historical Average (number or JSON)</div>
        <input style={s.input} value={avg} onChange={(e) => setAvg(e.target.value)} />
        <button style={s.btn} onClick={detect} disabled={loading}>{loading ? '⏳ Detecting…' : '🔍 Detect Anomalies'}</button>
      </div>

      {error && <div style={{ color: '#e94560', marginBottom: 16 }}>{error}</div>}

      {result && (
        <>
          <div style={s.card}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div><strong style={{ fontSize: 32, color: '#fbbf24' }}>{result.anomalies_detected || 0}</strong> anomalies</div>
              <div><span style={s.sev(result.alert_level)}>{result.alert_level}</span></div>
              <div style={{ color: '#a0a0b0' }}>Trend: <strong style={{ color: '#fbbf24' }}>{result.trend}</strong></div>
            </div>
            {result.statistics && (
              <div style={{ marginTop: 12, color: '#a0a0b0', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div>Mean: <strong>{result.statistics.mean}</strong></div>
                <div>Std Dev: <strong>{result.statistics.std_deviation}</strong></div>
                <div>Min: <strong>{result.statistics.min}</strong></div>
                <div>Max: <strong>{result.statistics.max}</strong></div>
                <div>Outliers: <strong>{result.statistics.outlier_count}</strong> ({result.statistics.outlier_percentage}%)</div>
              </div>
            )}
            <div style={{ marginTop: 8, color: '#e0e0e0' }}>{result.summary}</div>
          </div>

          {result.alerts?.length > 0 && (
            <div style={s.card}>
              <div style={s.label}>Alerts</div>
              {result.alerts.map((a) => (
                <div key={a.alert_id} style={{ padding: 12, background: '#1a1a2e', borderRadius: 6, marginBottom: 8, borderLeft: `3px solid ${a.severity === 'Critical' || a.severity === 'High' ? '#e94560' : '#f39c12'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong style={{ color: '#fbbf24' }}>{a.type}</strong>
                    <span style={s.sev(a.severity)}>{a.severity}</span>
                  </div>
                  <div style={{ color: '#e0e0e0', fontSize: 13 }}>{a.description}</div>
                  <div style={{ color: '#a0a0b0', fontSize: 12, marginTop: 4 }}>
                    Index {a.data_point_index} = {JSON.stringify(a.data_point_value)} · Expected {a.expected_range} · Deviation: {a.deviation}
                  </div>
                  <div style={{ color: '#2ecc71', fontSize: 12, marginTop: 4 }}>→ {a.recommended_action}</div>
                </div>
              ))}
            </div>
          )}

          {result.next_check_recommendation && (
            <div style={s.card}>
              <div style={s.label}>Next Check</div>
              <div style={{ color: '#e0e0e0' }}>{result.next_check_recommendation}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
