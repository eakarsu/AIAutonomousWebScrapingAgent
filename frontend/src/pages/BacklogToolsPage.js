import React, { useState } from 'react';
import api from '../services/api';

/**
 * Apply pass 5 backlog tools.
 *  - Headless plan
 *  - Proxy select
 *  - Robots check
 *  - Validation schema generator + record validator
 */
export default function BacklogToolsPage() {
  const [tab, setTab] = useState('headless');

  const s = {
    page: { padding: 30 },
    title: { color: '#e0e0e0', fontSize: 24, marginBottom: 20 },
    tabs: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
    tab: (active) => ({
      padding: '8px 16px', background: active ? '#e94560' : '#16213e',
      color: '#fff', border: '1px solid #0f3460', borderRadius: 8, cursor: 'pointer',
    }),
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>Backlog Tools</h1>
      <div style={s.tabs}>
        {[
          ['headless', 'Headless Plan'],
          ['proxy', 'Proxy Select'],
          ['robots', 'Robots Check'],
          ['schema', 'Schema Tools'],
          ['classify', 'Data Classify'],
          ['summary', 'Run Summary'],
        ].map(([k, label]) => (
          <button key={k} style={s.tab(tab === k)} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'headless' && <HeadlessPanel />}
      {tab === 'proxy' && <ProxyPanel />}
      {tab === 'robots' && <RobotsPanel />}
      {tab === 'schema' && <SchemaPanel />}
      {tab === 'classify' && <ClassifyPanel />}
      {tab === 'summary' && <SummaryPanel />}
    </div>
  );
}

function ClassifyPanel() {
  const [record, setRecord] = useState('{"name":"Acme Widget","price":"$19.99","email":"sales@acme.com","stock":42,"detail_url":"https://x.com/w"}');
  const [hints, setHints] = useState('product');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true); setErr(null); setData(null);
    try {
      const parsed = JSON.parse(record);
      const hintArr = hints.split(',').map(s => s.trim()).filter(Boolean);
      setData(await api.dataClassify({ record: parsed, hints: hintArr }));
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  return (
    <div style={cs.card}>
      <span style={cs.label}>Record (JSON)</span>
      <textarea style={{ ...cs.input, minHeight: 100 }} value={record} onChange={(e) => setRecord(e.target.value)} />
      <span style={cs.label}>Hints (comma-sep)</span>
      <input style={cs.input} value={hints} onChange={(e) => setHints(e.target.value)} />
      <button style={cs.btn} onClick={run} disabled={loading}>{loading ? 'Classifying...' : 'Classify Fields'}</button>
      <ResultBox data={data} error={err} />
    </div>
  );
}

function SummaryPanel() {
  const [runs, setRuns] = useState(JSON.stringify([
    { job_name: 'amazon-listings', status: 'success', records_extracted: 120 },
    { job_name: 'amazon-listings', status: 'failed', error: 'selector .price not found' },
    { job_name: 'ebay-listings', status: 'success', records_extracted: 85 },
  ], null, 2));
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true); setErr(null); setData(null);
    try {
      const parsed = JSON.parse(runs);
      setData(await api.runSummary({ runs: parsed }));
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  return (
    <div style={cs.card}>
      <span style={cs.label}>Runs (JSON array, max 200)</span>
      <textarea style={{ ...cs.input, minHeight: 160 }} value={runs} onChange={(e) => setRuns(e.target.value)} />
      <button style={cs.btn} onClick={run} disabled={loading}>{loading ? 'Summarising...' : 'Summarise Runs'}</button>
      <ResultBox data={data} error={err} />
    </div>
  );
}

const cs = {
  card: { background: '#16213e', border: '1px solid #0f3460', borderRadius: 12, padding: 20, marginBottom: 16 },
  input: { width: '100%', padding: 10, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: 8, color: '#e0e0e0', marginBottom: 12, fontFamily: 'monospace', fontSize: 13 },
  btn: { padding: '12px 24px', background: '#e94560', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' },
  label: { color: '#e94560', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  err: { color: '#e94560', marginTop: 10 },
  pre: { background: '#0a0a1f', color: '#9bc99b', padding: 14, borderRadius: 8, fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap' },
};

function ResultBox({ data, error }) {
  if (error) return <div style={cs.err}>{error}</div>;
  if (!data) return null;
  return <pre style={cs.pre}>{JSON.stringify(data, null, 2)}</pre>;
}

function HeadlessPanel() {
  const [url, setUrl] = useState('https://example.com/products');
  const [td, setTd] = useState('product titles, prices, stock counts');
  const [login, setLogin] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true); setErr(null); setData(null);
    try { setData(await api.headlessPlan({ url, target_data: td, requires_login: login })); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  };
  return (
    <div style={cs.card}>
      <span style={cs.label}>URL</span>
      <input style={cs.input} value={url} onChange={(e) => setUrl(e.target.value)} />
      <span style={cs.label}>Target Data</span>
      <input style={cs.input} value={td} onChange={(e) => setTd(e.target.value)} />
      <label style={{ color: '#e0e0e0' }}>
        <input type="checkbox" checked={login} onChange={(e) => setLogin(e.target.checked)} /> Requires login
      </label>
      <div style={{ marginTop: 12 }}>
        <button style={cs.btn} onClick={run} disabled={loading}>{loading ? 'Planning...' : 'Generate Plan'}</button>
      </div>
      <ResultBox data={data} error={err} />
    </div>
  );
}

function ProxyPanel() {
  const [exclude, setExclude] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const run = async () => {
    setErr(null); setData(null);
    const ex = exclude.split(',').map(s => s.trim()).filter(Boolean);
    try { setData(await api.proxySelect({ exclude: ex })); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div style={cs.card}>
      <p style={{ color: '#a0a0b0' }}>
        Returns 503 with `missing: PROXY_POOL` unless PROXY_POOL is set in backend env.
      </p>
      <span style={cs.label}>Exclude (comma-sep)</span>
      <input style={cs.input} value={exclude} onChange={(e) => setExclude(e.target.value)} />
      <button style={cs.btn} onClick={run}>Select Proxy</button>
      <ResultBox data={data} error={err} />
    </div>
  );
}

function RobotsPanel() {
  const [url, setUrl] = useState('https://www.example.com/some/page');
  const [ua, setUa] = useState('*');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true); setErr(null); setData(null);
    try { setData(await api.robotsCheck({ url, user_agent: ua })); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  };
  return (
    <div style={cs.card}>
      <span style={cs.label}>URL</span>
      <input style={cs.input} value={url} onChange={(e) => setUrl(e.target.value)} />
      <span style={cs.label}>User Agent</span>
      <input style={cs.input} value={ua} onChange={(e) => setUa(e.target.value)} />
      <button style={cs.btn} onClick={run} disabled={loading}>{loading ? 'Checking...' : 'Check Robots.txt'}</button>
      <ResultBox data={data} error={err} />
    </div>
  );
}

function SchemaPanel() {
  const [sample, setSample] = useState('{"title":"Widget","price":19.99,"in_stock":true,"url":"https://x.com/w"}');
  const [name, setName] = useState('ProductRecord');
  const [strict, setStrict] = useState(false);
  const [schema, setSchema] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const [validateRec, setValidateRec] = useState('{"title":"Widget","price":"$19.99"}');
  const [validateRes, setValidateRes] = useState(null);
  const [validateErr, setValidateErr] = useState(null);

  const gen = async () => {
    setLoading(true); setErr(null); setSchema(null);
    try {
      const parsedSample = JSON.parse(sample);
      const out = await api.validationSchema({ sample: parsedSample, name, strict });
      setSchema(out);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const validate = async () => {
    setValidateErr(null); setValidateRes(null);
    if (!schema || !schema.schema) { setValidateErr('Generate a schema first.'); return; }
    try {
      const rec = JSON.parse(validateRec);
      setValidateRes(await api.validateRecord({ schema: schema.schema, record: rec }));
    } catch (e) { setValidateErr(e.message); }
  };

  return (
    <div>
      <div style={cs.card}>
        <span style={cs.label}>Sample (JSON)</span>
        <textarea style={{ ...cs.input, minHeight: 80 }} value={sample} onChange={(e) => setSample(e.target.value)} />
        <span style={cs.label}>Name</span>
        <input style={cs.input} value={name} onChange={(e) => setName(e.target.value)} />
        <label style={{ color: '#e0e0e0' }}>
          <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} /> Strict (additionalProperties: false)
        </label>
        <div style={{ marginTop: 12 }}>
          <button style={cs.btn} onClick={gen} disabled={loading}>{loading ? 'Generating...' : 'Generate Schema'}</button>
        </div>
        <ResultBox data={schema} error={err} />
      </div>
      <div style={cs.card}>
        <h3 style={{ color: '#e0e0e0' }}>Validate Record (uses schema above)</h3>
        <span style={cs.label}>Record (JSON)</span>
        <textarea style={{ ...cs.input, minHeight: 80 }} value={validateRec} onChange={(e) => setValidateRec(e.target.value)} />
        <button style={cs.btn} onClick={validate}>Validate</button>
        <ResultBox data={validateRes} error={validateErr} />
      </div>
    </div>
  );
}
