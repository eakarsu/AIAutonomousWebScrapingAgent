import React, { useState } from 'react';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.token) { localStorage.setItem('token', data.token); onLogin(data); }
      else setError(data.error || 'Login failed');
    } catch (err) { setError('Connection failed'); }
    setLoading(false);
  };

  const fillCredentials = () => { setEmail('admin@example.com'); setPassword('admin123'); };

  const s = {
    container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' },
    card: { background: '#16213e', padding: '40px', borderRadius: '16px', width: '400px', border: '1px solid #0f3460', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' },
    title: { textAlign: 'center', color: '#e94560', fontSize: '28px', marginBottom: '8px' },
    subtitle: { textAlign: 'center', color: '#a0a0b0', fontSize: '14px', marginBottom: '30px' },
    input: { width: '100%', padding: '12px 16px', background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: '8px', color: '#e0e0e0', fontSize: '14px', marginBottom: '16px', outline: 'none' },
    btn: { width: '100%', padding: '12px', background: '#e94560', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '12px' },
    fillBtn: { width: '100%', padding: '10px', background: 'transparent', color: '#0f3460', border: '1px dashed #0f3460', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' },
    error: { background: '#e9456020', color: '#e94560', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', textAlign: 'center' }
  };

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.title}>🕷️ Web Scraping Agent</div>
        <div style={s.subtitle}>AI-Powered Autonomous Web Scraping</div>
        {error && <div style={s.error}>{error}</div>}
        <form onSubmit={handleLogin}>
          <input style={s.input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input style={s.input} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          <button style={s.btn} type="submit" disabled={loading}>{loading ? 'Logging in...' : 'Sign In'}</button>
        </form>
        <button style={s.fillBtn} onClick={fillCredentials}>🔑 Fill Demo Credentials</button>
      </div>
    </div>
  );
}
