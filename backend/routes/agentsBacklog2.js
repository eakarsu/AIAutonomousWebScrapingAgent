/**
 * /backend/routes/agentsBacklog2.js
 *
 * Apply pass 5 wave-1 — additional backlog endpoints (additive only).
 *
 *   POST /api/agents/data-classify    — classify the fields of a scraped
 *                                       record (PII / numeric / category /
 *                                       free-text / url / etc.)
 *   POST /api/agents/run-summary      — given a list of recent run results,
 *                                       summarise success rate, anomalies,
 *                                       and recommended fixes.
 *
 * Reuses the same auth wrapper (mounted at /api/agents with `auth` +
 * `aiLimiter` in server.js). Returns 503 with `missing: OPENROUTER_API_KEY`
 * when the API key is not configured.
 */

const express = require('express');
const axios = require('axios');

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
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/agents/data-classify
// Body: { record: object, hints?: string[] }
// Returns: { fields: [{name, value_sample, classification, confidence, ...}] }
// ---------------------------------------------------------------------------
router.post('/data-classify', async (req, res) => {
  if (!requireOpenRouter(res)) return;
  try {
    const { record, hints = [] } = req.body || {};
    if (!record || typeof record !== 'object') {
      return res.status(400).json({ error: "'record' must be an object" });
    }
    const sampleStr = JSON.stringify(record).substring(0, 3500);

    const content = await callAI([
      {
        role: 'user',
        content: `You are a data classification expert. Classify each field of the scraped record below into one of:
PII | EMAIL | PHONE | URL | NUMERIC | CURRENCY | DATE | CATEGORY | FREE_TEXT | BOOLEAN | IDENTIFIER | OTHER.
Provide a confidence score in [0,1] and a one-line justification per field.

HINTS: ${hints.join(', ') || 'none'}
RECORD:
${sampleStr}

Return strict JSON:
{
  "fields": [
    {"name": "...", "value_sample": "...", "classification": "...", "confidence": 0.9, "justification": "..."}
  ],
  "summary": {
    "pii_field_count": 0,
    "numeric_field_count": 0,
    "free_text_field_count": 0,
    "recommendation": "one sentence"
  }
}`,
      },
    ], { jsonMode: true });

    const parsed = parseAIJson(content) || { raw_result: content };
    res.json(parsed);
  } catch (err) {
    console.error('[data-classify]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/run-summary
// Body: { runs: [{job_name?, status, started_at?, finished_at?, error?, records_extracted?}] }
// Returns: { stats, anomalies, recommended_fixes }
// ---------------------------------------------------------------------------
router.post('/run-summary', async (req, res) => {
  if (!requireOpenRouter(res)) return;
  try {
    const { runs } = req.body || {};
    if (!Array.isArray(runs) || runs.length === 0) {
      return res.status(400).json({ error: "'runs' must be a non-empty array" });
    }
    if (runs.length > 200) {
      return res.status(400).json({ error: "'runs' cap is 200 entries per call" });
    }

    // Pre-compute deterministic stats so AI doesn't need to count
    const stats = {
      total: runs.length,
      success: 0,
      failed: 0,
      records_total: 0,
    };
    for (const r of runs) {
      const s = (r.status || '').toLowerCase();
      if (s === 'success' || s === 'completed' || s === 'ok') stats.success++;
      else stats.failed++;
      if (Number.isFinite(r.records_extracted)) stats.records_total += r.records_extracted;
    }
    stats.success_rate = stats.total ? +(stats.success / stats.total).toFixed(3) : 0;

    const runSample = JSON.stringify(runs.slice(0, 50)).substring(0, 6000);

    const content = await callAI([
      {
        role: 'user',
        content: `You are an SRE for a web-scraping fleet. Given the most recent runs and the deterministic stats, produce a concise diagnostic report.

DETERMINISTIC_STATS: ${JSON.stringify(stats)}
RUNS_SAMPLE (up to 50):
${runSample}

Return strict JSON with:
{
  "anomalies": [{"pattern": "...", "evidence": "...", "severity": "low|medium|high"}],
  "top_failure_modes": [{"error_signature": "...", "count_estimate": N}],
  "recommended_fixes": [{"action": "...", "reason": "..."}],
  "narrative": "2-3 sentences"
}`,
      },
    ], { jsonMode: true });

    const parsed = parseAIJson(content) || { raw_result: content };
    res.json({ stats, ...parsed });
  } catch (err) {
    console.error('[run-summary]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
