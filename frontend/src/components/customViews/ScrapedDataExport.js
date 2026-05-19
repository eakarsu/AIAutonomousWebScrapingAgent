import React, { useState } from 'react';

const API = (typeof window !== 'undefined' && window.location.port === '3600'
  ? 'http://localhost:3500'
  : 'http://localhost:3001') + '/api/custom-views';

export default function ScrapedDataExport() {
  const [limit, setLimit] = useState(200);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/export-csv?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const text = await blob.text();
      const newBlob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(newBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scraped_data_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      const rows = text.split('\n').length - 1;
      setStatus({ ok: true, msg: `Exported ${rows} rows (${(newBlob.size / 1024).toFixed(1)} KB)` });
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="scraped-data-export"
      style={{ background: '#16213e', padding: 20, borderRadius: 8, border: '1px solid #0f3460' }}
    >
      <h3 style={{ color: '#e94560', marginTop: 0 }}>Scraped-Data CSV Export</h3>
      <div style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 12 }}>
        Download a CSV of scraped records (most recent first; per-record JSON in the data_json column).
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <label style={{ color: '#fff', fontSize: 13 }}>Row limit:</label>
        <input
          type="number"
          min="1"
          max="1000"
          value={limit}
          onChange={(e) => setLimit(parseInt(e.target.value, 10) || 1)}
          style={{
            width: 110, padding: '6px 10px', background: '#0f3460', color: '#fff',
            border: '1px solid #1a4a7a', borderRadius: 4,
          }}
        />
        <button
          onClick={download}
          disabled={busy}
          data-testid="export-csv-btn"
          style={{
            padding: '8px 16px', background: '#e94560', color: '#fff',
            border: 'none', borderRadius: 4, cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Exporting...' : 'Download CSV'}
        </button>
      </div>
      {status && (
        <div style={{ color: status.ok ? '#27ae60' : '#e94560', fontSize: 13 }}>{status.msg}</div>
      )}
    </div>
  );
}
