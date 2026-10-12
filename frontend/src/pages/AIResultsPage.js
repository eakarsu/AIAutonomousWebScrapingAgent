import React, { useEffect, useState } from 'react';
import api from '../services/api';
import AIReport from '../components/AIReport';

export default function AIResultsPage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getAIResults({ page, limit: 20 })
      .then((response) => { if (active) { setItems(Array.isArray(response?.data) ? response.data : []); setPages(response.pagination?.pages || 0); } })
      .catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [page]);

  const open = async (item) => {
    setError('');
    try { setSelected(await api.getAIResult(item.id)); }
    catch (failure) { setError(failure.message); }
  };

  return <main style={{ padding: 30, color: '#e0e0e0' }}>
    <h1>AI results history</h1>
    {error && <p role="alert" style={{ color: '#e94560' }}>{error}</p>}
    {!items.length && !error && <p>No saved AI analyses yet.</p>}
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((item) => <button key={item.id} type="button" onClick={() => open(item)} style={{ textAlign: 'left', padding: 14, color: '#e0e0e0', background: '#16213e', border: '1px solid #0f3460', borderRadius: 8, cursor: 'pointer' }}>
        <strong>{item.endpoint || 'AI analysis'}</strong> · {new Date(item.created_at).toLocaleString()}
        {item.input_summary && <div style={{ marginTop: 4, color: '#a0a0b0' }}>{item.input_summary}</div>}
      </button>)}
    </div>
    {pages > 1 && <nav aria-label="AI results pages" style={{ display: 'flex', gap: 12, marginTop: 16 }}>
      <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
    </nav>}
    {selected && <section style={{ marginTop: 24 }} aria-label="Saved AI result detail">
      <button type="button" onClick={() => setSelected(null)}>Close detail</button>
      <AIReport response={selected.result} title={selected.endpoint || 'Saved AI analysis'} model={selected.model} />
    </section>}
  </main>;
}
