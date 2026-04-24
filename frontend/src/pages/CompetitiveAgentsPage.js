import React, { useState } from 'react';

const tabs = [
  { id: 'competitor', label: '🏢 Analyze Competitor', endpoint: '/api/competitive-agents/analyze-competitor' },
  { id: 'market', label: '📊 Market Analysis', endpoint: '/api/competitive-agents/analyze-market' },
  { id: 'swot', label: '🎯 SWOT Generator', endpoint: '/api/competitive-agents/generate-swot' },
];

const formConfig = {
  competitor: [
    { key: 'competitor_name', label: 'Competitor Name', type: 'input', placeholder: 'e.g., Acme Corp' },
    { key: 'competitor_url', label: 'Competitor URL', type: 'input', placeholder: 'e.g., https://acme.com' },
    { key: 'focus_areas', label: 'Focus Areas', type: 'textarea', placeholder: 'e.g., pricing, technology, content strategy...' },
  ],
  market: [
    { key: 'industry', label: 'Industry', type: 'input', placeholder: 'e.g., SaaS, E-commerce, FinTech' },
    { key: 'region', label: 'Region', type: 'input', placeholder: 'e.g., North America, Global' },
    { key: 'timeframe', label: 'Timeframe', type: 'input', placeholder: 'e.g., 2024-2025, current' },
  ],
  swot: [
    { key: 'company', label: 'Company', type: 'input', placeholder: 'e.g., Your Company Name' },
    { key: 'industry', label: 'Industry', type: 'input', placeholder: 'e.g., Technology, Healthcare' },
    { key: 'context', label: 'Context', type: 'textarea', placeholder: 'Additional context about the company...' },
  ],
};

const renderResult = (obj, depth = 0) => {
  if (!obj) return null;
  if (typeof obj === 'string') return <p style={{ color: '#e0e0e0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{obj}</p>;
  if (Array.isArray(obj)) return (
    <div style={{ marginLeft: depth * 12 }}>
      {obj.map((item, i) => (
        <div key={i} style={{ background: '#1a1a2e', padding: 12, borderRadius: 8, marginBottom: 8, borderLeft: '3px solid #e94560' }}>
          {typeof item === 'object' ? renderResult(item, depth + 1) : <span style={{ color: '#e0e0e0' }}>{String(item)}</span>}
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ marginLeft: depth * 12 }}>
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} style={{ marginBottom: 12 }}>
          <div style={{ color: '#e94560', fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 }}>{k.replace(/_/g, ' ')}</div>
          {typeof v === 'object' && v !== null ? renderResult(v, depth + 1) : (
            <div style={{ color: '#e0e0e0', background: '#1a1a2e', padding: '8px 12px', borderRadius: 6, fontSize: 14 }}>
              {typeof v === 'number' ? <span style={{ color: '#2ecc71', fontWeight: 'bold', fontSize: 18 }}>{v}</span> :
               typeof v === 'boolean' ? <span style={{ color: v ? '#2ecc71' : '#e94560', fontWeight: 'bold' }}>{v ? 'Yes' : 'No'}</span> : String(v)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default function CompetitiveAgentsPage() {
  const [activeTab, setActiveTab] = useState('competitor');
  const [formData, setFormData] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const s = {
    page: { padding: 30, background: '#0a0a1a', minHeight: '100vh' },
    title: { color: '#e94560', fontSize: 26, fontWeight: 'bold', marginBottom: 8 },
    subtitle: { color: '#888', fontSize: 14, marginBottom: 24 },
    tabs: { display: 'flex', gap: 8, marginBottom: 24 },
    tab: (active) => ({
      padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14, border: 'none',
      background: active ? '#e94560' : '#16213e', color: active ? '#fff' : '#a0a0b0', transition: 'all 0.2s'
    }),
    card: { background: '#16213e', borderRadius: 12, padding: 24, marginBottom: 24, border: '1px solid #0f3460' },
    label: { color: '#a0a0b0', fontSize: 13, marginBottom: 6, display: 'block' },
    input: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #0f3460', background: '#0a0a1a', color: '#e0e0e0', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' },
    textarea: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #0f3460', background: '#0a0a1a', color: '#e0e0e0', fontSize: 14, marginBottom: 16, minHeight: 100, boxSizing: 'border-box', resize: 'vertical' },
    btn: { padding: '12px 28px', borderRadius: 8, border: 'none', background: '#e94560', color: '#fff', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' },
    error: { background: '#2d1528', border: '1px solid #e94560', color: '#e94560', padding: 16, borderRadius: 12, marginBottom: 24 },
  };

  const handleSubmit = async () => {
    const tab = tabs.find(t => t.id === activeTab);
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`http://localhost:3001${tab.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setResult(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={s.page}>
      <div style={s.title}>Competitive Analysis Agents</div>
      <div style={s.subtitle}>AI-powered competitor analysis, market research, and SWOT generation</div>

      <div style={s.tabs}>
        {tabs.map(tab => (
          <button key={tab.id} style={s.tab(activeTab === tab.id)}
            onClick={() => { setActiveTab(tab.id); setResult(null); setError(''); }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={s.card}>
        {formConfig[activeTab].map(field => (
          <div key={field.key}>
            <label style={s.label}>{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea style={s.textarea} placeholder={field.placeholder}
                value={formData[field.key] || ''}
                onChange={e => setFormData({ ...formData, [field.key]: e.target.value })} />
            ) : (
              <input style={s.input} placeholder={field.placeholder}
                value={formData[field.key] || ''}
                onChange={e => setFormData({ ...formData, [field.key]: e.target.value })} />
            )}
          </div>
        ))}
        <button style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} onClick={handleSubmit} disabled={loading}>
          {loading ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {result && (
        <div style={s.card}>
          <div style={{ color: '#e94560', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Results</div>
          {renderResult(result)}
        </div>
      )}
    </div>
  );
}
