import React, { useState } from 'react';
import api from '../services/api';

/**
 * Scrape Quality Validator.
 * POST /api/agents/quality-validator { run_a, run_b, job_name }
 */
export default function QualityValidatorPage() {
  const [jobName, setJobName] = useState('');
  const [runA, setRunA] = useState('[]');
  const [runB, setRunB] = useState('[]');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const validate = async () => {
    setLoading(true); setError(null); setResult(null);
    let a, b;
    try { a = JSON.parse(runA); } catch (e) { setError('Run A is not valid JSON'); setLoading(false); return; }
    try { b = JSON.parse(runB); } catch (e) { setError('Run B is not valid JSON'); setLoading(false); return; }
    try {
      const data = await api.qualityValidator({ run_a: a, run_b: b, job_name: jobName || 'Untitled' });
      setResult(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const s = {
    page: { padding: 30 },
    title: { color: '#e0e0e0', fontSize: 24, marginBottom: 20 },
    card: { background: '#16213e', border: '1px solid #0f3460', borderRadius: 12, padding: 20, marginBottom: 16 },
    input: { width: '100%', padding: 10, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 8, color: '#e0e0e0', marginBottom: 12 },
    textarea: { width: '100%', padding: 10, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 8, color: '#e0e0e0', minHeight: 140, fontFamily: 'monospace', fontSize: 12, marginBottom: 12 },
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
      <h1 style={s.title}>🔍 Scrape Quality Validator</h1>
      <p style={{ color: '#a0a0b0', marginBottom: 20 }}>
        Compare two consecutive scrape runs to detect data drift, missing fields, type changes, and quality regressions.
      </p>

      <div style={s.card}>
        <div style={s.label}>Job Name</div>
        <input style={s.input} placeholder="e.g. Daily Product Catalog" value={jobName} onChange={(e) => setJobName(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={s.label}>Run A (baseline JSON)</div>
            <textarea style={s.textarea} value={runA} onChange={(e) => setRunA(e.target.value)} />
          </div>
          <div>
            <div style={s.label}>Run B (latest JSON)</div>
            <textarea style={s.textarea} value={runB} onChange={(e) => setRunB(e.target.value)} />
          </div>
        </div>

        <button style={s.btn} onClick={validate} disabled={loading}>{loading ? '⏳ Validating…' : '🔍 Compare Runs'}</button>
      </div>

      {error && <div style={{ color: '#e94560', marginBottom: 16 }}>{error}</div>}

      {result && (
        <>
          <div style={s.card}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div><strong style={{ fontSize: 32, color: '#fbbf24' }}>{result.anomalies_found || 0}</strong> anomalies</div>
              <div><span style={s.sev(result.anomaly_severity)}>{result.anomaly_severity}</span></div>
              {result.alert_needed && <div style={{ color: '#e94560' }}>🚨 Alert: {result.alert_message}</div>}
            </div>
            {result.comparison_summary && (
              <div style={{ marginTop: 12, color: '#a0a0b0' }}>
                Run A: {result.comparison_summary.run_a_record_count} records · Run B: {result.comparison_summary.run_b_record_count} records ·
                Δ {result.comparison_summary.count_delta} ({result.comparison_summary.count_delta_pct}%)
              </div>
            )}
            <div style={{ marginTop: 8, color: '#a0a0b0' }}>
              Drift score: <strong style={{ color: '#fbbf24' }}>{result.data_drift_score}</strong> ·
              Quality A: <strong>{result.quality_score_run_a}</strong> · Quality B: <strong>{result.quality_score_run_b}</strong>
            </div>
          </div>

          {result.anomalies?.length > 0 && (
            <div style={s.card}>
              <div style={s.label}>Anomalies</div>
              {result.anomalies.map((a, i) => (
                <div key={i} style={{ padding: 12, background: '#1a1a2e', borderRadius: 6, marginBottom: 8, borderLeft: `3px solid ${a.severity === 'Critical' || a.severity === 'High' ? '#e94560' : '#f39c12'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong style={{ color: '#fbbf24' }}>{a.type} · {a.field}</strong>
                    <span style={s.sev(a.severity)}>{a.severity}</span>
                  </div>
                  <div style={{ color: '#e0e0e0', marginTop: 6, fontSize: 13 }}>{a.description}</div>
                  <div style={{ color: '#a0a0b0', marginTop: 4, fontSize: 12 }}>
                    A: <code>{JSON.stringify(a.run_a_value)}</code> → B: <code>{JSON.stringify(a.run_b_value)}</code>
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.recommendations?.length > 0 && (
            <div style={s.card}>
              <div style={s.label}>Recommendations</div>
              {result.recommendations.map((r, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <span style={s.sev(r.priority)}>{r.priority}</span> <strong style={{ color: '#e0e0e0' }}>{r.action}</strong> — <span style={{ color: '#a0a0b0' }}>{r.reason}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
