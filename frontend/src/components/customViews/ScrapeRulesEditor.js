import React, { useEffect, useState } from 'react';

const API = (typeof window !== 'undefined' && window.location.port === '3600'
  ? 'http://localhost:3500'
  : 'http://localhost:3001') + '/api/custom-views';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const inp = {
  padding: '8px 10px', background: '#0f3460', color: '#fff',
  border: '1px solid #1a4a7a', borderRadius: 4, fontSize: 13,
};
const th = { textAlign: 'left', padding: 8, color: '#e94560', fontSize: 12 };
const td = { padding: 8 };

export default function ScrapeRulesEditor() {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState({
    name: '', target: '', op: '==', value: '', selector: '', enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = () => {
    fetch(`${API}/rules`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { setRules(d.rules || []); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  };

  useEffect(load, []);

  const addRule = async () => {
    if (!form.name || !form.target) {
      setErr('name and target are required');
      return;
    }
    setErr(null);
    const res = await fetch(`${API}/rules`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ name: '', target: '', op: '==', value: '', selector: '', enabled: true });
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || `HTTP ${res.status}`);
    }
  };

  const toggleRule = async (rule) => {
    await fetch(`${API}/rules/${rule.id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    load();
  };

  const removeRule = async (id) => {
    await fetch(`${API}/rules/${id}`, { method: 'DELETE', headers: authHeaders() });
    load();
  };

  if (loading) return <div style={{ color: '#a0a0b0' }}>Loading rules...</div>;

  return (
    <div
      data-testid="scrape-rules-editor"
      style={{ background: '#16213e', padding: 20, borderRadius: 8, border: '1px solid #0f3460' }}
    >
      <h3 style={{ color: '#e94560', marginTop: 0 }}>Scrape Rules Editor (CRUD selectors)</h3>
      <div style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 12 }}>
        {rules.length} rule(s) configured. Each rule binds an optional CSS selector to a guard condition.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1.2fr 0.6fr 0.8fr 1fr auto',
          gap: 6,
          marginBottom: 12,
        }}
      >
        <input
          placeholder="Rule name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={inp}
        />
        <input
          placeholder="Target (e.g. extracted.title)"
          value={form.target}
          onChange={(e) => setForm({ ...form, target: e.target.value })}
          style={inp}
        />
        <select
          value={form.op}
          onChange={(e) => setForm({ ...form, op: e.target.value })}
          style={inp}
        >
          <option value="==">==</option>
          <option value="!=">!=</option>
          <option value=">">&gt;</option>
          <option value=">=">&gt;=</option>
          <option value="<">&lt;</option>
          <option value="<=">&lt;=</option>
        </select>
        <input
          placeholder="Value"
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          style={inp}
        />
        <input
          placeholder="Selector (.price)"
          value={form.selector}
          onChange={(e) => setForm({ ...form, selector: e.target.value })}
          style={inp}
        />
        <button
          onClick={addRule}
          data-testid="add-rule-btn"
          style={{
            padding: '8px 14px', background: '#e94560', color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>
      {err && (
        <div style={{ color: '#e94560', fontSize: 12, marginBottom: 10 }}>Error: {err}</div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#0f3460' }}>
            <th style={th}>Name</th>
            <th style={th}>Target</th>
            <th style={th}>Op</th>
            <th style={th}>Value</th>
            <th style={th}>Selector</th>
            <th style={th}>Enabled</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #0f3460' }}>
              <td style={td}>{r.name}</td>
              <td style={td}>
                <code style={{ color: '#a0a0b0' }}>{r.target}</code>
              </td>
              <td style={td}>{r.op}</td>
              <td style={td}>{r.value}</td>
              <td style={td}>
                <code style={{ color: '#a0a0b0' }}>{r.selector || '—'}</code>
              </td>
              <td style={td}>
                <button
                  onClick={() => toggleRule(r)}
                  style={{
                    padding: '4px 10px',
                    background: r.enabled ? '#27ae60' : '#555',
                    color: '#fff', border: 'none', borderRadius: 3,
                    cursor: 'pointer', fontSize: 11,
                  }}
                >
                  {r.enabled ? 'ON' : 'OFF'}
                </button>
              </td>
              <td style={td}>
                <button
                  onClick={() => removeRule(r.id)}
                  style={{
                    padding: '4px 10px', background: '#e94560', color: '#fff',
                    border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11,
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
