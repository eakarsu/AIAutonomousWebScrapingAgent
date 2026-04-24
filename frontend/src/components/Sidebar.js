import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const menuItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/jobs', label: 'Scraping Jobs', icon: '🔄' },
  { path: '/data', label: 'Scraped Data', icon: '📦' },
  { path: '/logs', label: 'Agent Logs', icon: '📋' },
  { path: '/agents', label: 'AI Agents', icon: '🤖' },
  { path: '/competitive-agents', label: 'Competitive Analysis', icon: '🏆' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const styles = {
    sidebar: { width: 250, background: '#16213e', height: '100vh', position: 'fixed', left: 0, top: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #0f3460' },
    logo: { padding: '20px', fontSize: '18px', fontWeight: 'bold', color: '#e94560', borderBottom: '1px solid #0f3460', textAlign: 'center' },
    menu: { flex: 1, padding: '10px 0' },
    item: (active) => ({
      padding: '12px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
      background: active ? '#0f3460' : 'transparent', color: active ? '#e94560' : '#a0a0b0',
      borderLeft: active ? '3px solid #e94560' : '3px solid transparent', transition: 'all 0.2s',
      fontSize: '14px'
    }),
    logout: { padding: '15px 20px', borderTop: '1px solid #0f3460', cursor: 'pointer', color: '#e94560', textAlign: 'center', fontSize: '14px' }
  };

  return (
    <div style={styles.sidebar}>
      <div style={styles.logo}>🕷️ Web Scraping Agent</div>
      <div style={styles.menu}>
        {menuItems.map(item => (
          <div key={item.path} style={styles.item(location.pathname === item.path)}
            onClick={() => navigate(item.path)}
            onMouseEnter={e => { if (location.pathname !== item.path) e.target.style.background = '#0f3460'; }}
            onMouseLeave={e => { if (location.pathname !== item.path) e.target.style.background = 'transparent'; }}>
            <span>{item.icon}</span> {item.label}
          </div>
        ))}
      </div>
      <div style={styles.logout} onClick={() => { localStorage.removeItem('token'); window.location.href = '/'; }}>
        🚪 Logout
      </div>
    </div>
  );
}
