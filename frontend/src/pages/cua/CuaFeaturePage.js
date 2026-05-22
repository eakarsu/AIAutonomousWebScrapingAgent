/**
 * CuaFeaturePage — generic 4-tab page (List / Detail+AI / Create / AI Panel)
 * Used by all 8 CUA feature wrappers.
 *
 * Props:
 *   title       string            Display title
 *   slug        string            API slug (e.g. "desktopControl")
 *   idField     string            Primary display field in list rows (default "id")
 *   labelField  string            Human-readable label field (default "name" or first string col)
 *   createFields  [{name, label, type?, placeholder?, options?}]
 *   aiVerbs     [{verb, label, extraFields?:[{name,label,placeholder}]}]
 *   listColumns [{key, label}]
 *   detailIdField string          field name used as record ID param for AI verbs (default "sessionId")
 */
import React, { useState, useEffect, useCallback } from 'react';
import { cuaFeat } from './cuaApi';
import { s, C, Spinner, Err, JsonDisplay, StatusBadge, Pagination } from './CuaShared';

export default function CuaFeaturePage({
  title,
  slug,
  listColumns,
  createFields,
  aiVerbs,
  detailIdField = 'sessionId',
}) {
  const api = cuaFeat(slug);
  const [tab, setTab] = useState('list');

  // ── LIST state ─────────────────────────────────────────────────────────
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({});
  const [page, setPage] = useState(1);
  const [searchQ, setSearchQ] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [listErr, setListErr] = useState('');

  // ── DETAIL state ────────────────────────────────────────────────────────
  const [detailId, setDetailId] = useState('');
  const [detailRecord, setDetailRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState('');
  const [actionResult, setActionResult] = useState(null);
  const [actionLoading, setActionLoading] = useState('');

  // ── CREATE state ────────────────────────────────────────────────────────
  const [createVals, setCreateVals] = useState({});
  const [createLoading, setCreateLoading] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const [createResult, setCreateResult] = useState(null);

  // ── AI PANEL state ──────────────────────────────────────────────────────
  const [aiRecordId, setAiRecordId] = useState('');
  const [activeVerb, setActiveVerb] = useState(aiVerbs[0]?.verb || '');
  const [verbExtras, setVerbExtras] = useState({});
  const [aiPanelLoading, setAiPanelLoading] = useState(false);
  const [aiPanelErr, setAiPanelErr] = useState('');
  const [aiPanelResult, setAiPanelResult] = useState(null);

  // ── LIST load ───────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setListLoading(true); setListErr('');
    try {
      let res;
      if (searchQ.trim()) {
        res = await api.search(searchQ.trim(), { page, limit: 20 });
        setRows(res.data || []);
        setPagination({});
      } else {
        res = await api.list({ page, limit: 20 });
        setRows(res.data || []);
        setPagination(res.pagination || {});
      }
    } catch (e) { setListErr(e.message); }
    setListLoading(false);
  }, [slug, page, searchQ]); // api ref is stable per slug

  useEffect(() => { if (tab === 'list') loadList(); }, [tab, loadList]);

  // ── DETAIL load ─────────────────────────────────────────────────────────
  const loadDetail = async () => {
    if (!detailId.trim()) return;
    setDetailLoading(true); setDetailErr(''); setDetailRecord(null); setActionResult(null);
    try {
      const res = await api.getById(detailId.trim());
      setDetailRecord(res.data || res);
    } catch (e) { setDetailErr(e.message); }
    setDetailLoading(false);
  };

  const runDetailAction = async (actionFn, label) => {
    setActionLoading(label); setActionResult(null);
    try {
      const res = await actionFn();
      setDetailRecord(res.data || detailRecord);
      setActionResult(res);
    } catch (e) { setActionResult({ error: e.message }); }
    setActionLoading('');
  };

  // ── CREATE ──────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setCreateLoading(true); setCreateErr(''); setCreateResult(null);
    try {
      const res = await api.create(createVals);
      setCreateResult(res.data || res);
      setCreateVals({});
    } catch (e) { setCreateErr(e.message); }
    setCreateLoading(false);
  };

  // ── AI PANEL ────────────────────────────────────────────────────────────
  const runAiVerb = async () => {
    if (!aiRecordId.trim() || !activeVerb) return;
    setAiPanelLoading(true); setAiPanelErr(''); setAiPanelResult(null);
    try {
      const body = { [detailIdField]: aiRecordId.trim(), ...verbExtras };
      const res = await api.aiVerb(activeVerb, body);
      setAiPanelResult(res);
    } catch (e) { setAiPanelErr(e.message); }
    setAiPanelLoading(false);
  };

  const currentVerbMeta = aiVerbs.find((v) => v.verb === activeVerb) || aiVerbs[0];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <h1 style={s.h1}>{title}</h1>

      {/* TABS */}
      <div style={s.tabs}>
        {['list', 'detail', 'create', 'ai-panel'].map((t) => (
          <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
            {t === 'list' ? 'List' : t === 'detail' ? 'Detail + Actions' : t === 'create' ? 'Create' : 'AI Panel'}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ───────────────────────────────────────────────────────── */}
      {tab === 'list' && (
        <div>
          <div style={s.row}>
            <input
              style={{ ...s.input, maxWidth: 320 }}
              placeholder="Search..."
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
            />
            <button style={s.btn()} onClick={loadList}>Refresh</button>
            <a href={api.exportCsvUrl()} style={{ ...s.btn(C.success), textDecoration: 'none', display: 'inline-block' }}>Export CSV</a>
          </div>
          {listLoading && <Spinner />}
          <Err msg={listErr} />
          {!listLoading && rows.length === 0 && !listErr && (
            <div style={{ color: C.muted, fontSize: 13 }}>No records found.</div>
          )}
          {rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {listColumns.map((col) => (
                      <th key={col.key} style={s.th}>{col.label}</th>
                    ))}
                    <th style={s.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} style={{ cursor: 'pointer' }}>
                      {listColumns.map((col) => (
                        <td key={col.key} style={s.td}>
                          {col.key === 'status' ? (
                            <StatusBadge status={row[col.key]} />
                          ) : col.key.includes('_at') && row[col.key] ? (
                            new Date(row[col.key]).toLocaleString()
                          ) : col.key === 'archived' ? (
                            String(row[col.key])
                          ) : (
                            String(row[col.key] ?? '')
                          )}
                        </td>
                      ))}
                      <td style={s.td}>
                        <button
                          style={{ ...s.btn(C.accent), fontSize: 12, padding: '4px 12px', marginRight: 6 }}
                          onClick={() => { setDetailId(String(row.id)); setTab('detail'); }}
                        >
                          View
                        </button>
                        <button
                          style={{ ...s.btn(C.danger), fontSize: 12, padding: '4px 10px' }}
                          onClick={async () => {
                            if (!window.confirm('Archive this record?')) return;
                            try { await api.remove(row.id); loadList(); } catch (e) { alert(e.message); }
                          }}
                        >
                          Del
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={pagination.totalPages} onPage={setPage} />
        </div>
      )}

      {/* ── DETAIL TAB ─────────────────────────────────────────────────────── */}
      {tab === 'detail' && (
        <div>
          <div style={s.row}>
            <input
              style={{ ...s.input, maxWidth: 280 }}
              placeholder="Record ID"
              value={detailId}
              onChange={(e) => setDetailId(e.target.value)}
            />
            <button style={s.btn()} onClick={loadDetail} disabled={detailLoading}>Load</button>
          </div>
          <Err msg={detailErr} />
          {detailLoading && <Spinner />}
          {detailRecord && (
            <>
              <div style={s.card}>
                <div style={s.h2}>Record #{detailRecord.id}</div>
                <table style={s.table}>
                  <tbody>
                    {Object.entries(detailRecord).map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ ...s.td, color: C.muted, width: 180, fontWeight: 600 }}>{k}</td>
                        <td style={s.td}>{k === 'status' ? <StatusBadge status={v} /> : String(v ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Quick actions */}
              <div style={s.card}>
                <div style={s.h2}>Quick Actions</div>
                <div style={s.row}>
                  <button style={s.btn(C.warn)} disabled={!!actionLoading} onClick={() => runDetailAction(() => api.archive(detailRecord.id), 'archive')}>
                    {actionLoading === 'archive' ? 'Working…' : 'Archive'}
                  </button>
                  <button style={s.btn(C.success)} disabled={!!actionLoading} onClick={() => runDetailAction(() => api.restore(detailRecord.id), 'restore')}>
                    {actionLoading === 'restore' ? 'Working…' : 'Restore'}
                  </button>
                  <button style={s.btnGhost} disabled={!!actionLoading} onClick={() => runDetailAction(() => api.history(detailRecord.id), 'history')}>
                    {actionLoading === 'history' ? 'Loading…' : 'History'}
                  </button>
                </div>
                {actionResult && <JsonDisplay data={actionResult} />}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CREATE TAB ─────────────────────────────────────────────────────── */}
      {tab === 'create' && (
        <div style={s.card}>
          <div style={s.h2}>Create New Record</div>
          {createFields.map((f) => (
            <div key={f.name} style={{ marginBottom: 14 }}>
              <label style={s.label}>{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  style={s.textarea}
                  placeholder={f.placeholder || ''}
                  value={createVals[f.name] || ''}
                  onChange={(e) => setCreateVals((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              ) : f.type === 'select' ? (
                <select
                  style={s.input}
                  value={createVals[f.name] || ''}
                  onChange={(e) => setCreateVals((v) => ({ ...v, [f.name]: e.target.value }))}
                >
                  <option value="">-- select --</option>
                  {(f.options || []).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  style={s.input}
                  type={f.type || 'text'}
                  placeholder={f.placeholder || ''}
                  value={createVals[f.name] || ''}
                  onChange={(e) => setCreateVals((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <Err msg={createErr} />
          <button style={s.btn()} onClick={handleCreate} disabled={createLoading}>
            {createLoading ? 'Creating…' : 'Create'}
          </button>
          {createResult && (
            <div>
              <div style={{ color: C.success, fontSize: 13, marginTop: 10 }}>Created successfully!</div>
              <JsonDisplay data={createResult} />
            </div>
          )}
        </div>
      )}

      {/* ── AI PANEL TAB ───────────────────────────────────────────────────── */}
      {tab === 'ai-panel' && (
        <div>
          <div style={s.card}>
            <div style={s.h2}>AI Verb Panel ({aiVerbs.length} verbs)</div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Record ID ({detailIdField})</label>
              <input
                style={{ ...s.input, maxWidth: 280 }}
                placeholder="Enter record ID"
                value={aiRecordId}
                onChange={(e) => setAiRecordId(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Select AI Verb</label>
              <select
                style={s.input}
                value={activeVerb}
                onChange={(e) => { setActiveVerb(e.target.value); setVerbExtras({}); setAiPanelResult(null); setAiPanelErr(''); }}
              >
                {aiVerbs.map((v) => (
                  <option key={v.verb} value={v.verb}>{v.label}</option>
                ))}
              </select>
            </div>

            {/* Extra fields for the selected verb */}
            {currentVerbMeta?.extraFields?.map((ef) => (
              <div key={ef.name} style={{ marginBottom: 12 }}>
                <label style={s.label}>{ef.label}</label>
                <input
                  style={s.input}
                  placeholder={ef.placeholder || ''}
                  value={verbExtras[ef.name] || ''}
                  onChange={(e) => setVerbExtras((x) => ({ ...x, [ef.name]: e.target.value }))}
                />
              </div>
            ))}

            <Err msg={aiPanelErr} />
            <button style={s.btn(C.accentAlt)} onClick={runAiVerb} disabled={aiPanelLoading || !aiRecordId.trim()}>
              {aiPanelLoading ? 'Running…' : `Run: ${activeVerb}`}
            </button>
            {aiPanelResult && <JsonDisplay data={aiPanelResult} />}
          </div>

          {/* All verbs quick-reference grid */}
          <div style={s.card}>
            <div style={s.h2}>All AI Verbs — Quick Reference</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 8 }}>
              {aiVerbs.map((v) => (
                <div
                  key={v.verb}
                  style={{ background: activeVerb === v.verb ? C.accentAlt + '22' : '#0d1117', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}
                  onClick={() => { setActiveVerb(v.verb); setVerbExtras({}); setAiPanelResult(null); window.scrollTo(0, 0); }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: activeVerb === v.verb ? C.accentAlt : C.accent }}>{v.verb}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{v.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
