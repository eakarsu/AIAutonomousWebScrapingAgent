import React, { useState, useEffect } from 'react';
import api from '../services/api';
import DetailPanel from '../components/DetailPanel';

export default function DataPage() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => { loadData(); }, []);
  const loadData = () => api.getData({ search }).then(setData).catch(console.error);

  const handleSearch = (e) => { e.preventDefault(); loadData(); };

  const s = {
    page: { padding: '30px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
    title: { fontSize: '24px', color: '#e0e0e0' },
    searchForm: { display: 'flex', gap: '10px' },
    searchInput: { padding: '10px 14px', background: '#16213e', border: '1px solid #0f3460', borderRadius: '8px', color: '#e0e0e0', fontSize: '14px', width: '250px', outline: 'none' },
    searchBtn: { padding: '10px 20px', background: '#0f3460', color: '#e0e0e0', border: 'none', borderRadius: '8px', cursor: 'pointer' },
    table: { width: '100%', borderCollapse: 'collapse', background: '#16213e', borderRadius: '12px', overflow: 'hidden' },
    th: { padding: '12px 16px', textAlign: 'left', background: '#0f3460', color: '#a0a0b0', fontSize: '12px', textTransform: 'uppercase' },
    td: { padding: '12px 16px', borderBottom: '1px solid #0f346030', fontSize: '14px', color: '#e0e0e0' },
    deleteBtn: { padding: '6px 12px', background: '#e94560', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Scraped Data ({data.length})</h1>
        <form style={s.searchForm} onSubmit={handleSearch}>
          <input style={s.searchInput} placeholder="Search data..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={s.searchBtn} type="submit">Search</button>
        </form>
      </div>
      <table style={s.table}>
        <thead><tr><th style={s.th}>ID</th><th style={s.th}>Job</th><th style={s.th}>Data Preview</th><th style={s.th}>Scraped At</th></tr></thead>
        <tbody>
          {data.map(item => (
            <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(item)}
              onMouseEnter={e => e.currentTarget.style.background = '#0f346020'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <td style={s.td}>{item.id}</td>
              <td style={s.td}>{item.job_name || 'N/A'}</td>
              <td style={{...s.td, maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{JSON.stringify(item.data).substring(0, 100)}</td>
              <td style={s.td}>{new Date(item.scraped_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <DetailPanel isOpen={!!selected} onClose={() => setSelected(null)} title="Data Details">
        {selected && <>
          <div style={{marginBottom:'16px'}}><div style={{color:'#a0a0b0',fontSize:'12px'}}>Job</div><div style={{color:'#e0e0e0'}}>{selected.job_name}</div></div>
          <div style={{marginBottom:'16px'}}><div style={{color:'#a0a0b0',fontSize:'12px'}}>URL</div><div style={{color:'#e0e0e0',wordBreak:'break-all'}}>{selected.url}</div></div>
          <div style={{marginBottom:'16px'}}><div style={{color:'#a0a0b0',fontSize:'12px'}}>Scraped At</div><div style={{color:'#e0e0e0'}}>{new Date(selected.scraped_at).toLocaleString()}</div></div>
          <div style={{marginBottom:'16px'}}><div style={{color:'#a0a0b0',fontSize:'12px'}}>Data</div><pre style={{background:'#1a1a2e',padding:'12px',borderRadius:'8px',fontSize:'12px',overflow:'auto',color:'#e0e0e0',maxHeight:'400px'}}>{JSON.stringify(selected.data, null, 2)}</pre></div>
          <button style={s.deleteBtn} onClick={async () => { await api.deleteData(selected.id); setSelected(null); loadData(); }}>🗑️ Delete</button>
        </>}
      </DetailPanel>
    </div>
  );
}
