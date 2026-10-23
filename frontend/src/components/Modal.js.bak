import React from 'react';

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: '#16213e', borderRadius: '12px', padding: '24px', width: '500px', maxHeight: '80vh', overflow: 'auto', border: '1px solid #0f3460' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: '#e94560', fontSize: '18px' }}>{title}</h2>
          <span style={{ cursor: 'pointer', color: '#a0a0b0', fontSize: '24px' }} onClick={onClose}>&times;</span>
        </div>
        {children}
      </div>
    </div>
  );
}
