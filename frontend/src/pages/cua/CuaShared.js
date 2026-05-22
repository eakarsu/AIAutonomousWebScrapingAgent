/**
 * Shared styling constants and micro-components for CUA pages
 * (no external dependencies — plain React + inline styles)
 */
import React from 'react';

export const C = {
  bg: '#0d1117',
  surface: '#161b22',
  border: '#21262d',
  accent: '#58a6ff',
  accentAlt: '#bc8cff',
  danger: '#f85149',
  success: '#3fb950',
  warn: '#d29922',
  text: '#e6edf3',
  muted: '#8b949e',
  chip: '#1f6feb22',
};

export const s = {
  page: { padding: '28px 32px', background: C.bg, minHeight: '100vh', color: C.text },
  h1: { fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 20 },
  h2: { fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 14 },
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 16 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 11, color: C.muted, marginBottom: 4, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { padding: '8px 12px', background: '#0d1117', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13, width: '100%', outline: 'none' },
  textarea: { padding: '8px 12px', background: '#0d1117', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13, width: '100%', minHeight: 90, resize: 'vertical', fontFamily: 'inherit', outline: 'none' },
  btn: (color) => ({ padding: '8px 18px', background: color || C.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btnGhost: { padding: '7px 16px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  badge: (color) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: (color || C.accent) + '22', color: color || C.accent }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 12px', background: C.surface, color: C.muted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${C.border}` },
  td: { padding: '10px 12px', borderBottom: `1px solid ${C.border}`, color: C.text, verticalAlign: 'top' },
  result: { background: '#0d1117', border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginTop: 12, fontSize: 13, color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300, overflow: 'auto' },
  tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 },
  tab: (active) => ({ padding: '8px 18px', background: 'transparent', color: active ? C.accent : C.muted, border: 'none', borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent', cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 400, marginBottom: -1 }),
  fg: { display: 'flex', gap: 12, marginBottom: 14 },
  field: { flex: 1 },
};

export function Spinner() {
  return <span style={{ color: C.muted, fontSize: 13 }}>Loading…</span>;
}

export function Err({ msg }) {
  if (!msg) return null;
  return <div style={{ color: C.danger, fontSize: 13, marginTop: 8 }}>{String(msg)}</div>;
}

export function JsonDisplay({ data }) {
  if (data === null || data === undefined) return null;
  return (
    <pre style={s.result}>
      {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function StatusBadge({ status }) {
  const colors = { active: C.success, running: C.success, idle: C.muted, error: C.danger, failed: C.danger, pending: C.warn, completed: C.accent, done: C.accent };
  return <span style={s.badge(colors[String(status).toLowerCase()] || C.muted)}>{status || 'unknown'}</span>;
}

export function Pagination({ page, totalPages, onPage }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
      <button style={s.btnGhost} disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
      <span style={{ color: C.muted, fontSize: 13 }}>Page {page} / {totalPages}</span>
      <button style={s.btnGhost} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
