import React from 'react';

export default function DetailPanel({ isOpen, title, onClose, onEdit, onDelete, item, fields, children }) {
  const visible = isOpen !== undefined ? isOpen : !!item;
  if (!visible) return null;

  const displayFields = item
    ? (fields && fields.length
        ? fields
        : Object.keys(item).filter(k => !['id', '_id'].includes(k)).map(k => ({ key: k, label: k.replace(/_/g, ' ') })))
    : [];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ width: '90%', maxWidth: 560, maxHeight: '88vh', background: '#16213e', border: '1px solid #0f3460', borderRadius: 12, overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #0f3460', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#e94560', fontSize: 18, margin: 0 }}>{title || item?.name || item?.title || item?.db_name || 'Record Details'}</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a0a0b0', fontSize: 24, lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
          {item && displayFields.map(f => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <div style={{ color: '#e94560', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 }}>{f.label}</div>
              <div style={{ color: '#e0e0e0', fontSize: 13, background: '#1a1a2e', padding: '8px 12px', borderRadius: 6, wordBreak: 'break-word' }}>
                {item[f.key] !== undefined && item[f.key] !== null && item[f.key] !== ''
                  ? (typeof item[f.key] === 'object' ? JSON.stringify(item[f.key]) : String(item[f.key]))
                  : '—'}
              </div>
            </div>
          ))}
          {children}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #0f3460', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {(onEdit || item) && (
            <button type="button" onClick={onEdit || onClose} style={{ padding: '8px 16px', background: '#0f3460', color: '#e0e0e0', border: '1px solid #3498db', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Edit
            </button>
          )}
          {(onDelete || item) && (
            <button type="button" onClick={onDelete || onClose} style={{ padding: '8px 16px', background: '#2d1528', color: '#e94560', border: '1px solid #e94560', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: '#1a1a2e', color: '#a0a0b0', border: '1px solid #0f3460', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
