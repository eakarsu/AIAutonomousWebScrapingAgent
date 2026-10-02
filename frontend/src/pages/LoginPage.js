import React, { useState } from 'react';

function __demoAutofill() {
  (async () => {
    let email = "";
    let password = "";
    try {
      const response = await fetch("/api/auth/demo-credentials", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        email = data.email || data.username || "";
        password = data.password || "";
      }
    } catch (error) {
      /* fall back to build-time credentials below */
    }
    if (!email || !password) {
      const env = (typeof process !== "undefined" && process.env) ? process.env : {};
      email = email || env.REACT_APP_DEMO_EMAIL || env.VITE_DEMO_EMAIL || "";
      password = password || env.REACT_APP_DEMO_PASSWORD || env.VITE_DEMO_PASSWORD || "";
    }
    const form = document.querySelector("form");
    const setValue = (element, value) => {
      if (!element) return;
      const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const scope = form || document;
    setValue(scope.querySelector('input[type="email"], input[name="email"], input[name="username"]') || scope.querySelectorAll("input")[0], email);
    setValue(scope.querySelector('input[type="password"], input[name="password"]') || scope.querySelectorAll("input")[1], password);
    window.setTimeout(() => {
      if (form && typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        const submit = scope.querySelector('button[type="submit"], input[type="submit"]');
        if (submit) submit.click();
      }
    }, 50);
  })();
}

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.token) { localStorage.setItem('token', data.token); onLogin(data); }
      else setError(data.error || 'Login failed');
    } catch (err) { setError('Connection failed'); }
    setLoading(false);
  };

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
          <button
            type="button"
            onClick={__demoAutofill}
            aria-label="Auto Fill Demo Credentials"
            style={{ width: '100%', marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid currentColor', background: 'transparent', cursor: 'pointer' }}
          >
            Auto Fill Demo Credentials
          </button>
          <button style={s.btn} type="submit" disabled={loading}>{loading ? 'Logging in...' : 'Sign In'}</button>
        </form>
      </div>
    </div>
  );
}
