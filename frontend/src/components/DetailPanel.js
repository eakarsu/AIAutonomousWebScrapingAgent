import React from 'react';

export default function DetailPanel({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, width: '450px', height: '100vh', background: '#16213e', borderLeft: '2px solid #0f3460', zIndex: 999, overflow: 'auto', boxShadow: '-5px 0 20px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #0f3460', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#e94560', fontSize: '18px' }}>{title}</h2>
        <span style={{ cursor: 'pointer', color: '#a0a0b0', fontSize: '24px' }} onClick={onClose}>&times;</span>
      </div>
      <div style={{ padding: '20px', flex: 1, overflow: 'auto' }}>{children}</div>
    </div>
  );
}
