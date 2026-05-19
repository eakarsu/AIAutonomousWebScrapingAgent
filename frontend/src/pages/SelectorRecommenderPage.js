import React, { useState } from 'react';
import api from '../services/api';

/**
 * Dynamic Selector Recommender.
 * POST /api/agents/selector-recommender { html_snippet, failed_selector }
 */
export default function SelectorRecommenderPage() {
  const [html, setHtml] = useState('');
  const [selector, setSelector] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const recommend = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await api.selectorRecommender({ html_snippet: html, failed_selector: selector });
      setResult(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const s = {
    page: { padding: 30 },
    title: { color: '#e0e0e0', fontSize: 24, marginBottom: 20 },
    card: { background: '#16213e', border: '1px solid #0f3460', borderRadius: 12, padding: 20, marginBottom: 16 },
    input: { width: '100%', padding: 10, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 8, color: '#e0e0e0', marginBottom: 12, fontFamily: 'monospace' },
    textarea: { width: '100%', padding: 10, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 8, color: '#e0e0e0', minHeight: 200, fontFamily: 'monospace', fontSize: 12, marginBottom: 12 },
    btn: { padding: '12px 24px', background: '#e94560', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' },
    label: { color: '#e94560', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 },
    code: { background: '#1a1a2e', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', color: '#fbbf24' },
    risk: (r) => ({
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 'bold',
      background: r === 'High' ? '#e9456020' : r === 'Medium' ? '#f39c1220' : '#2ecc7120',
      color: r === 'High' ? '#e94560' : r === 'Medium' ? '#f39c12' : '#2ecc71',
    }),
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>🎯 Selector Recommender</h1>
      <p style={{ color: '#a0a0b0', marginBottom: 20 }}>
        When a CSS selector breaks, paste the page HTML and the failed selector. AI suggests 3 robust alternatives.
      </p>

      <div style={s.card}>
        <div style={s.label}>Failed CSS Selector</div>
        <input style={s.input} placeholder=".product-price-old" value={selector} onChange={(e) => setSelector(e.target.value)} />
        <div style={s.label}>HTML Snippet (paste page source)</div>
        <textarea style={s.textarea} value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<div class='product'>...</div>" />
        <button style={s.btn} onClick={recommend} disabled={loading || !html || !selector}>
          {loading ? '⏳ Analyzing…' : '🤖 Recommend Selectors'}
        </button>
      </div>

      {error && <div style={{ color: '#e94560', marginBottom: 16 }}>{error}</div>}

      {result && (
        <>
          <div style={s.card}>
            <div style={s.label}>Target Element</div>
            <div style={{ color: '#e0e0e0' }}>{result.target_element_description}</div>
            <div style={{ marginTop: 12 }}>
              <div style={s.label}>Why Original Failed</div>
              <div style={{ color: '#a0a0b0' }}>{result.why_original_failed}</div>
            </div>
          </div>

          {result.alternatives?.map((alt, i) => (
            <div key={i} style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <span style={{ background: '#e94560', color: '#fff', padding: '4px 10px', borderRadius: 12, fontWeight: 'bold', marginRight: 8 }}>#{alt.rank}</span>
                  <code style={s.code}>{alt.selector}</code>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: '#fbbf24' }}>Confidence: {alt.confidence}%</span>
                  <span style={s.risk(alt.fragility_risk)}>{alt.fragility_risk} risk</span>
                </div>
              </div>
              <div style={{ color: '#a0a0b0', marginBottom: 6, fontSize: 13 }}>
                <strong>Type:</strong> {alt.selector_type} · <strong>Matches:</strong> ~{alt.matches_count}
              </div>
              <div style={{ color: '#e0e0e0', marginBottom: 6 }}>{alt.explanation}</div>
              <div style={{ color: '#a0a0b0', fontSize: 12, fontStyle: 'italic' }}>⚠️ {alt.fragility_notes}</div>
            </div>
          ))}

          {result.best_practice_tips?.length > 0 && (
            <div style={s.card}>
              <div style={s.label}>💡 Best Practice Tips</div>
              {result.best_practice_tips.map((t, i) => <div key={i} style={{ color: '#a0a0b0', marginBottom: 4 }}>• {t}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
