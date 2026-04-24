import React, { useState } from 'react';
import api from '../services/api';

export default function AgentsPage() {
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [htmlSnippet, setHtmlSnippet] = useState('');
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('analyze');

  const handleAnalyze = async () => {
    setLoading(true); setResult(null);
    try { const data = await api.analyzeUrl({ url, description }); setResult(data); } catch (err) { setResult({ error: err.message }); }
    setLoading(false);
  };

  const handleExtract = async () => {
    setLoading(true); setResult(null);
    try { const data = await api.extractData({ html_snippet: htmlSnippet, instruction }); setResult(data); } catch (err) { setResult({ error: err.message }); }
    setLoading(false);
  };

  const handleClean = async () => {
    setLoading(true); setResult(null);
    try { const data = await api.cleanData({ data: JSON.parse(htmlSnippet || '[]') }); setResult(data); } catch (err) { setResult({ error: err.message }); }
    setLoading(false);
  };

  const renderResult = (obj, depth = 0) => {
    if (!obj) return null;
    if (typeof obj === 'string') return <p style={{ color: '#e0e0e0', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{obj}</p>;
    if (Array.isArray(obj)) return (
      <div style={{ marginLeft: depth * 12 }}>
        {obj.map((item, i) => (
          <div key={i} style={{ background: '#1a1a2e', padding: '12px', borderRadius: '8px', marginBottom: '8px', borderLeft: '3px solid #e94560' }}>
            {typeof item === 'object' ? renderResult(item, depth + 1) : <span style={{ color: '#e0e0e0' }}>{String(item)}</span>}
          </div>
        ))}
      </div>
    );
    return (
      <div style={{ marginLeft: depth * 12 }}>
        {Object.entries(obj).map(([key, value]) => (
          <div key={key} style={{ marginBottom: '12px' }}>
            <div style={{ color: '#e94560', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>
              {key.replace(/_/g, ' ')}
            </div>
            {typeof value === 'object' && value !== null ? renderResult(value, depth + 1) : (
              <div style={{ color: '#e0e0e0', background: '#1a1a2e', padding: '8px 12px', borderRadius: '6px', fontSize: '14px' }}>
                {typeof value === 'number' ? (
                  <span style={{ color: '#2ecc71', fontWeight: 'bold', fontSize: '18px' }}>{value}</span>
                ) : String(value)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const s = {
    page: { padding: '30px' },
    title: { fontSize: '24px', color: '#e0e0e0', marginBottom: '24px' },
    tabs: { display: 'flex', gap: '4px', marginBottom: '24px' },
    tab: (active) => ({ padding: '10px 20px', background: active ? '#e94560' : '#16213e', color: active ? '#fff' : '#a0a0b0', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: '14px', fontWeight: active ? 'bold' : 'normal' }),
    card: { background: '#16213e', borderRadius: '12px', padding: '24px', border: '1px solid #0f3460' },
    input: { width: '100%', padding: '10px 14px', background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: '8px', color: '#e0e0e0', fontSize: '14px', marginBottom: '12px', outline: 'none' },
    textarea: { width: '100%', padding: '10px 14px', background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: '8px', color: '#e0e0e0', fontSize: '14px', marginBottom: '12px', outline: 'none', minHeight: '100px', resize: 'vertical', fontFamily: 'inherit' },
    label: { color: '#a0a0b0', fontSize: '12px', marginBottom: '4px', display: 'block' },
    btn: { padding: '12px 24px', background: '#e94560', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
    resultCard: { marginTop: '24px', background: '#16213e', borderRadius: '12px', padding: '24px', border: '1px solid #0f3460' },
    resultTitle: { color: '#e94560', fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #0f3460' }
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>AI Agents</h1>
      <div style={s.tabs}>
        <button style={s.tab(activeTab === 'analyze')} onClick={() => { setActiveTab('analyze'); setResult(null); }}>🔍 URL Analyzer</button>
        <button style={s.tab(activeTab === 'extract')} onClick={() => { setActiveTab('extract'); setResult(null); }}>📦 Data Extractor</button>
        <button style={s.tab(activeTab === 'clean')} onClick={() => { setActiveTab('clean'); setResult(null); }}>🧹 Data Cleaner</button>
      </div>
      <div style={s.card}>
        {activeTab === 'analyze' && <>
          <label style={s.label}>Website URL</label>
          <input style={s.input} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/products" />
          <label style={s.label}>Description (optional)</label>
          <input style={s.input} value={description} onChange={e => setDescription(e.target.value)} placeholder="What kind of data to scrape" />
          <button style={s.btn} onClick={handleAnalyze} disabled={loading}>{loading ? '⏳ Analyzing...' : '🤖 Analyze URL'}</button>
        </>}
        {activeTab === 'extract' && <>
          <label style={s.label}>HTML Snippet</label>
          <textarea style={s.textarea} value={htmlSnippet} onChange={e => setHtmlSnippet(e.target.value)} placeholder="<div class='product'>...</div>" />
          <label style={s.label}>Extraction Instruction</label>
          <input style={s.input} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Extract product names and prices" />
          <button style={s.btn} onClick={handleExtract} disabled={loading}>{loading ? '⏳ Extracting...' : '📦 Extract Data'}</button>
        </>}
        {activeTab === 'clean' && <>
          <label style={s.label}>Raw Data (JSON array)</label>
          <textarea style={s.textarea} value={htmlSnippet} onChange={e => setHtmlSnippet(e.target.value)} placeholder='[{"name": "Product 1", "price": "$19.99"}]' />
          <button style={s.btn} onClick={handleClean} disabled={loading}>{loading ? '⏳ Cleaning...' : '🧹 Clean Data'}</button>
        </>}
      </div>
      {result && (
        <div style={s.resultCard}>
          <div style={s.resultTitle}>🤖 AI Analysis Result</div>
          {result.error ? <div style={{ color: '#e94560' }}>{result.error}</div> : renderResult(result)}
        </div>
      )}
    </div>
  );
}
