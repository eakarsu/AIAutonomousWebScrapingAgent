/**
 * /backend/routes/agentsBacklog.js
 *
 * Apply pass 5 — backlog endpoints.
 *
 * ENV VARS:
 *   OPENROUTER_API_KEY   AI features below 503 with `missing: OPENROUTER_API_KEY` if unset.
 *   PROXY_PROVIDER       Optional. If set (e.g., 'brightdata', 'oxylabs'), proxy-rotation
 *                        endpoint returns concrete recommendations; if unset, returns 503.
 *   PROXY_POOL           Optional. Comma-separated proxy URL pool. If unset, the
 *                        proxy-rotation/select endpoint returns 503 with `missing: PROXY_POOL`.
 *
 * PRODUCT-DECISION: Headless browsers, robots.txt rate-limiter, and proxy provider
 *   integration are NOT installed as new dependencies (TOO-RISKY for this pass).
 *   Instead we ship advisory + planning endpoints that produce execution plans the
 *   operator can apply manually or via a future worker.
 */

const express = require('express');
const axios = require('axios');
const pool = require('../models/db');

const router = express.Router();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022';

function requireOpenRouter(res) {
  if (!process.env.OPENROUTER_API_KEY) {
    res.status(503).json({
      error: 'AI features unavailable: OPENROUTER_API_KEY is not configured',
      missing: 'OPENROUTER_API_KEY',
    });
    return false;
  }
  return true;
}

async function callAI(messages, options = {}) {
  const { model = MODEL, jsonMode = false } = options;
  const payload = { model, messages };
  if (jsonMode) payload.response_format = { type: 'json_object' };

  const response = await axios.post(OPENROUTER_URL, payload, {
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
      'X-Title': 'AI Autonomous Web Scraping Agent',
    },
    timeout: 60000,
  });
  return response.data.choices[0].message.content;
}

function parseAIJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const stripped = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch (e) {}
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) { try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {} }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/agents/headless-plan
// MECHANICAL — additive only. Generates a plan describing what a headless
// browser run would need (selectors, wait conditions, JS-render flags).
// PRODUCT-DECISION: We do NOT install Puppeteer/Playwright in this pass to
//   avoid heavy native deps. The plan can later be executed by a worker.
// Body: { url, target_data, requires_login? }
// ---------------------------------------------------------------------------
router.post('/headless-plan', async (req, res) => {
  if (!requireOpenRouter(res)) return;
  try {
    const { url, target_data, requires_login } = req.body;
    if (!url || !target_data) {
      return res.status(400).json({ error: "'url' and 'target_data' are required" });
    }

    const content = await callAI([
      {
        role: 'user',
        content: `You are a headless-browser automation expert. The user wants to extract this data from this URL using a JS-rendered page approach (Puppeteer/Playwright).

URL: ${url}
TARGET DATA: ${target_data}
REQUIRES LOGIN: ${requires_login ? 'Yes' : 'No'}

Produce a step-by-step plan as JSON with exactly these fields:
{
  "summary": "one sentence",
  "needs_headless": true,
  "reasons": ["why a static-HTML scraper would fail"],
  "navigation_steps": [{"step": 1, "action": "navigate", "detail": "..."}],
  "wait_conditions": ["e.g., await selector .product-card"],
  "selectors": [{"name": "title", "css": "h1.product-title"}],
  "anti_bot_concerns": ["..."],
  "estimated_runtime_ms": 5000
}`,
      },
    ], { jsonMode: true });

    const parsed = parseAIJson(content) || { raw_result: content };
    res.json(parsed);
  } catch (err) {
    console.error('[headless-plan]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/proxy-select
// NEEDS-CREDS — gates on PROXY_POOL env var.
// Body: { job_id?, exclude?: [string] }
// Returns a proxy URL chosen via round-robin from PROXY_POOL.
// ---------------------------------------------------------------------------
let _proxyCursor = 0;
router.post('/proxy-select', async (req, res) => {
  const pool_str = process.env.PROXY_POOL;
  if (!pool_str) {
    return res.status(503).json({
      error: 'Proxy rotation unavailable: PROXY_POOL is not configured',
      missing: 'PROXY_POOL',
      hint: 'Set PROXY_POOL="http://user:pass@p1:8080,http://user:pass@p2:8080" to enable',
    });
  }
  try {
    const { exclude = [] } = req.body || {};
    const proxies = pool_str.split(',').map(s => s.trim()).filter(Boolean);
    const eligible = proxies.filter(p => !exclude.includes(p));
    if (eligible.length === 0) {
      return res.status(409).json({ error: 'All proxies excluded' });
    }
    // PRODUCT-DECISION: round-robin with no health-tracking persistence in this pass.
    const proxy = eligible[_proxyCursor % eligible.length];
    _proxyCursor = (_proxyCursor + 1) % eligible.length;
    res.json({
      proxy,
      pool_size: proxies.length,
      eligible_count: eligible.length,
      strategy: 'round-robin',
      provider: process.env.PROXY_PROVIDER || 'unspecified',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/robots-check
// MECHANICAL — fetches and parses robots.txt for a URL.
// Returns crawl-delay, disallowed paths matching the URL, and a rate suggestion.
// Additive: no new dep, uses built-in https/axios.
// Body: { url, user_agent? }
// ---------------------------------------------------------------------------
router.post('/robots-check', async (req, res) => {
  try {
    const { url, user_agent = '*' } = req.body;
    if (!url) return res.status(400).json({ error: "'url' is required" });

    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

    let body = '';
    let status = 0;
    try {
      const r = await axios.get(robotsUrl, { timeout: 10000, validateStatus: () => true });
      body = typeof r.data === 'string' ? r.data : '';
      status = r.status;
    } catch (e) {
      return res.status(502).json({ error: 'robots.txt fetch failed', detail: e.message });
    }

    if (status >= 400) {
      return res.json({
        robots_url: robotsUrl,
        http_status: status,
        allowed: true,
        crawl_delay_seconds: null,
        recommended_min_interval_seconds: 1,
        note: 'No robots.txt found — assume allowed but use polite default delay',
      });
    }

    // Minimal parser — tracks user-agent blocks
    const lines = body.split(/\r?\n/);
    let active = false;
    let allow = [];
    let disallow = [];
    let crawlDelay = null;
    for (const raw of lines) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const m = line.match(/^([A-Za-z-]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      if (key === 'user-agent') {
        active = (value === '*' || value.toLowerCase() === user_agent.toLowerCase());
        continue;
      }
      if (!active) continue;
      if (key === 'disallow' && value) disallow.push(value);
      if (key === 'allow' && value) allow.push(value);
      if (key === 'crawl-delay') {
        const n = parseFloat(value);
        if (!Number.isNaN(n)) crawlDelay = n;
      }
    }

    const path = parsed.pathname || '/';
    const matchedDisallow = disallow.find(p => path.startsWith(p));
    const matchedAllow = allow.find(p => path.startsWith(p));
    const allowed = !matchedDisallow || (matchedAllow && matchedAllow.length > matchedDisallow.length);

    res.json({
      robots_url: robotsUrl,
      http_status: status,
      user_agent_used: user_agent,
      allowed: !!allowed,
      matched_disallow: matchedDisallow || null,
      matched_allow: matchedAllow || null,
      crawl_delay_seconds: crawlDelay,
      recommended_min_interval_seconds: crawlDelay != null ? crawlDelay : 1,
      raw_disallow_for_agent: disallow.slice(0, 50),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/validation-schema
// MECHANICAL — generates a JSON-Schema-shaped validator for scraped records.
// Uses AI to infer the schema from a sample.
// PRODUCT-DECISION: emits JSON Schema v7 (most widely supported), no new dep.
// Body: { sample, name?, strict? }
// ---------------------------------------------------------------------------
router.post('/validation-schema', async (req, res) => {
  if (!requireOpenRouter(res)) return;
  try {
    const { sample, name = 'ScrapedRecord', strict = false } = req.body;
    if (sample === undefined || sample === null) {
      return res.status(400).json({ error: "'sample' is required" });
    }

    const sampleStr = JSON.stringify(sample).substring(0, 4000);

    const content = await callAI([
      {
        role: 'user',
        content: `You are a data-engineering expert. Generate a JSON Schema (draft-07) for the following sample scraped record. Mark required fields, infer types, add format hints (uri, email, date-time) where possible.

NAME: ${name}
STRICT MODE: ${strict ? 'set additionalProperties=false' : 'allow additional properties'}
SAMPLE:
${sampleStr}

Return JSON with exactly:
{
  "name": "${name}",
  "schema": { /* draft-07 JSON Schema object */ },
  "required_fields": ["..."],
  "notes": ["any inference assumptions"]
}`,
      },
    ], { jsonMode: true });

    const parsed = parseAIJson(content) || { raw_result: content };
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/validate-record
// MECHANICAL — validate a record against a previously-generated JSON Schema.
// No new dep: minimal validator handles type/required only.
// Body: { schema, record }
// ---------------------------------------------------------------------------
router.post('/validate-record', async (req, res) => {
  try {
    const { schema, record } = req.body;
    if (!schema || record === undefined) {
      return res.status(400).json({ error: "'schema' and 'record' are required" });
    }
    const errors = [];
    if (schema.type === 'object' || schema.properties) {
      const required = Array.isArray(schema.required) ? schema.required : [];
      for (const f of required) {
        if (record[f] === undefined || record[f] === null) {
          errors.push({ path: f, code: 'required', message: `Missing required field '${f}'` });
        }
      }
      const props = schema.properties || {};
      for (const [k, def] of Object.entries(props)) {
        if (record[k] === undefined) continue;
        const val = record[k];
        const expected = def.type;
        if (!expected) continue;
        const expectedList = Array.isArray(expected) ? expected : [expected];
        const actual = val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val;
        const actualMapped = actual === 'number' && Number.isInteger(val) ? ['number', 'integer'] : [actual];
        const ok = expectedList.some(t => actualMapped.includes(t));
        if (!ok) {
          errors.push({ path: k, code: 'type', message: `Expected ${expectedList.join('|')}, got ${actual}` });
        }
      }
      if (schema.additionalProperties === false) {
        for (const k of Object.keys(record)) {
          if (!(k in props)) {
            errors.push({ path: k, code: 'additional', message: `Unexpected field '${k}'` });
          }
        }
      }
    }
    res.json({ valid: errors.length === 0, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
