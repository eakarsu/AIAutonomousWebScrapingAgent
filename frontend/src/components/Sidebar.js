import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const sections = [
  {
    title: 'Overview',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    ],
  },
  {
    title: 'Scraping',
    items: [
      { path: '/jobs', label: 'Scraping Jobs', icon: '🔄' },
      { path: '/data', label: 'Scraped Data', icon: '📦' },
      { path: '/logs', label: 'Agent Logs', icon: '📋' },
      { path: '/job-queue', label: 'Async Job Queue', icon: '⚙️' },
      { path: '/export', label: 'CSV Export', icon: '📤' },
    ],
  },
  {
    title: 'AI Agents',
    items: [
      { path: '/agents', label: 'URL/HTML/Clean', icon: '🤖' },
      { path: '/schedule-optimizer', label: 'Schedule Optimizer', icon: '📅' },
      { path: '/quality-validator', label: 'Quality Validator', icon: '🔍' },
      { path: '/selector-recommender', label: 'Selector Recommender', icon: '🎯' },
      { path: '/anomaly-alerts', label: 'Anomaly Alerts', icon: '🚨' },
      { path: '/backlog-tools', label: 'Backlog Tools', icon: '🛠️' },
    ],
  },
  {
    title: 'Competitive Intel',
    items: [
      { path: '/competitive-agents-manager', label: 'Agents Manager', icon: '🏆' },
      { path: '/competitive-agents', label: 'One-shot Analysis', icon: '🔬' },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const styles = {
    sidebar: { width: 250, background: '#16213e', height: '100vh', position: 'fixed', left: 0, top: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #0f3460', overflow: 'auto' },
    logo: { padding: '20px', fontSize: '18px', fontWeight: 'bold', color: '#e94560', borderBottom: '1px solid #0f3460', textAlign: 'center' },
    menu: { flex: 1, padding: '10px 0' },
    sectionTitle: { padding: '12px 20px 6px', color: '#5b6685', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.6px' },
    item: (active) => ({
      padding: '10px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
      background: active ? '#0f3460' : 'transparent', color: active ? '#e94560' : '#a0a0b0',
      borderLeft: active ? '3px solid #e94560' : '3px solid transparent', transition: 'all 0.2s',
      fontSize: '13px',
    }),
    logout: { padding: '15px 20px', borderTop: '1px solid #0f3460', cursor: 'pointer', color: '#e94560', textAlign: 'center', fontSize: '14px' },
  };

  return (
    <div style={styles.sidebar}>
      <div style={styles.logo}>🕷️ Web Scraping Agent</div>
      <div style={styles.menu}>
        {sections.map((sec) => (
          <div key={sec.title}>
            <div style={styles.sectionTitle}>{sec.title}</div>
            {sec.items.map((item) => (
              <div key={item.path} style={styles.item(location.pathname === item.path)}
                onClick={() => navigate(item.path)}>
                <span>{item.icon}</span> {item.label}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={styles.logout} onClick={() => { localStorage.removeItem('token'); window.location.href = '/'; }}>
        🚪 Logout
      </div>
    </div>
  );
}
