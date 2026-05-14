/**
 * /backend/routes/agentsNew.js
 *
 * New AI agent feature endpoints:
 *   POST /api/agents/schedule-optimizer
 *   POST /api/agents/quality-validator
 *   POST /api/agents/selector-recommender
 *   POST /api/agents/anomaly-alerts
 */

const express = require('express');
const axios = require('axios');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireFields(body, fields) {
  for (const field of fields) {
    const val = body[field];
    if (val === undefined || val === null || val === '') {
      return `'${field}' is required`;
    }
  }
  return null;
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

// parseAIJson — robust JSON extraction from AI responses
function parseAIJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const stripped = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch (e) {}
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) { try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {} }
  return null;
}

async function persistAIResult(endpoint, userId, inputSummary, result) {
  try {
    await pool.query(
      'INSERT INTO ai_results (endpoint, model, user_id, input_summary, result) VALUES ($1, $2, $3, $4, $5)',
      [endpoint, MODEL, userId || null, inputSummary, JSON.stringify(result)]
    );
  } catch (err) {
    console.error('[persistAIResult] Failed to persist AI result:', err.message);
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/schedule-optimizer
// Body: { jobs: Array<{ id, name, url, schedule, last_run_at?, avg_duration_s? }> }
// ---------------------------------------------------------------------------
router.post('/schedule-optimizer', auth, async (req, res) => {
  try {
    const { jobs } = req.body;

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: "'jobs' must be a non-empty array" });
    }

    const jobSummary = jobs.map((j, i) =>
      `${i + 1}. ID: ${j.id || i + 1} | Name: ${j.name || 'Unnamed'} | URL: ${j.url || 'N/A'} | Current Schedule: ${j.schedule || 'N/A'} | Last Run: ${j.last_run_at || 'Never'} | Avg Duration: ${j.avg_duration_s ? j.avg_duration_s + 's' : 'Unknown'}`
    ).join('\n');

    let content;
    try {
      content = await callAI([
        {
          role: 'user',
          content: `You are a scheduling optimization expert for distributed web scraping systems.

Analyze the following ${jobs.length} scraping jobs for:
1. Schedule conflicts (overlapping run times)
2. Resource contention (too many jobs running at once)
3. Optimal distribution across time windows
4. Load balancing (spread jobs evenly)

CURRENT JOBS:
${jobSummary}

Return a JSON schedule optimization report with exactly these fields:
{
  "total_jobs": ${jobs.length},
  "conflicts_found": 0,
  "conflict_details": [
    {
      "job_ids": [1, 2],
      "conflict_type": "Overlap",
      "description": "explanation"
    }
  ],
  "optimized_schedule": [
    {
      "job_id": 1,
      "job_name": "name",
      "current_cron": "current schedule",
      "recommended_cron": "optimized cron expression",
      "reason": "why this change is recommended",
      "expected_load_reduction": "20%"
    }
  ],
  "optimal_windows": [
    {
      "window": "02:00-04:00 UTC",
      "reason": "why this is optimal",
      "recommended_job_count": 3
    }
  ],
  "load_distribution_score": {
    "before": 60,
    "after": 85
  },
  "summary": "brief explanation of key changes",
  "warnings": ["any important warnings"]
}`,
        },
      ], { jsonMode: true });
    } catch (aiErr) {
      console.error('[schedule-optimizer] OpenRouter error:', aiErr.message);
      return res.status(502).json({
        error: 'AI service unavailable. Please try again later.',
        detail: aiErr.response?.data?.error || aiErr.message,
      });
    }

    const parsed = parseAIJson(content) || { raw_result: content };
    await persistAIResult('schedule-optimizer', req.user?.id, `jobs:${jobs.length}`, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('[schedule-optimizer]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/quality-validator
// Body: { run_a: object|array, run_b: object|array, job_name?: string }
// ---------------------------------------------------------------------------
router.post('/quality-validator', auth, async (req, res) => {
  try {
    const { run_a, run_b, job_name } = req.body;

    if (run_a === undefined || run_a === null) {
      return res.status(400).json({ error: "'run_a' (first scrape run data) is required" });
    }
    if (run_b === undefined || run_b === null) {
      return res.status(400).json({ error: "'run_b' (second scrape run data) is required" });
    }

    const runAStr = JSON.stringify(run_a).substring(0, 3000);
    const runBStr = JSON.stringify(run_b).substring(0, 3000);

    let content;
    try {
      content = await callAI([
        {
          role: 'user',
          content: `You are a data quality expert for web scraping systems. Compare two scrape run results and detect data drift, anomalies, and quality issues.

JOB: ${job_name || 'Unknown Job'}

RUN A (baseline / earlier):
${runAStr}

RUN B (latest / current):
${runBStr}

Analyze for:
1. Missing fields or keys compared to run A
2. Value type changes (e.g. string became null)
3. Significant value drift (prices, counts, text changes)
4. New unexpected fields in run B
5. Volume changes (record count differences)
6. Data format inconsistencies

Return a JSON anomaly report with exactly these fields:
{
  "job_name": "${job_name || 'Unknown Job'}",
  "comparison_summary": {
    "run_a_record_count": 0,
    "run_b_record_count": 0,
    "count_delta": 0,
    "count_delta_pct": 0
  },
  "anomalies_found": 0,
  "anomaly_severity": "None",
  "anomalies": [
    {
      "type": "MissingField",
      "field": "field name or path",
      "severity": "Medium",
      "run_a_value": "example value from run A",
      "run_b_value": "example value from run B",
      "description": "what changed and why it matters"
    }
  ],
  "data_drift_score": 0,
  "quality_score_run_a": 100,
  "quality_score_run_b": 100,
  "recommendations": [
    {
      "action": "recommended action",
      "priority": "High",
      "reason": "why"
    }
  ],
  "alert_needed": false,
  "alert_message": null
}`,
        },
      ], { jsonMode: true });
    } catch (aiErr) {
      console.error('[quality-validator] OpenRouter error:', aiErr.message);
      return res.status(502).json({
        error: 'AI service unavailable. Please try again later.',
        detail: aiErr.response?.data?.error || aiErr.message,
      });
    }

    const parsed = parseAIJson(content) || { raw_result: content };
    await persistAIResult('quality-validator', req.user?.id, `job:${job_name || 'unknown'}`, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('[quality-validator]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/selector-recommender
// Body: { html_snippet, failed_selector }
// ---------------------------------------------------------------------------
router.post('/selector-recommender', auth, async (req, res) => {
  try {
    const { html_snippet, failed_selector } = req.body;

    const fieldErr = requireFields(req.body, ['html_snippet', 'failed_selector']);
    if (fieldErr) return res.status(400).json({ error: fieldErr });

    if (typeof html_snippet !== 'string' || html_snippet.trim().length === 0) {
      return res.status(400).json({ error: "'html_snippet' must be a non-empty string" });
    }

    let content;
    try {
      content = await callAI([
        {
          role: 'user',
          content: `You are an expert in web scraping and CSS selectors. A scraping selector has stopped working and needs alternatives.

FAILED SELECTOR: ${failed_selector}

HTML SNIPPET:
${html_snippet.substring(0, 4000)}

Analyze the HTML and suggest exactly 3 alternative CSS selectors that would reliably target the same element(s). For each selector, explain why it is more robust than the failed one.

Return ONLY valid JSON with exactly this structure:
{
  "failed_selector": "${failed_selector.replace(/"/g, '\\"')}",
  "target_element_description": "what element the failed selector was targeting",
  "alternatives": [
    {
      "rank": 1,
      "selector": "css selector",
      "selector_type": "Class",
      "confidence": 90,
      "matches_count": 1,
      "explanation": "why this selector is reliable",
      "fragility_risk": "Low",
      "fragility_notes": "what could break this selector"
    },
    {
      "rank": 2,
      "selector": "css selector",
      "selector_type": "Attribute",
      "confidence": 80,
      "matches_count": 1,
      "explanation": "explanation",
      "fragility_risk": "Medium",
      "fragility_notes": "notes"
    },
    {
      "rank": 3,
      "selector": "css selector",
      "selector_type": "Tag",
      "confidence": 70,
      "matches_count": 1,
      "explanation": "explanation",
      "fragility_risk": "Medium",
      "fragility_notes": "notes"
    }
  ],
  "why_original_failed": "analysis of why the original selector broke",
  "best_practice_tips": ["tip 1", "tip 2"]
}`,
        },
      ], { jsonMode: true });
    } catch (aiErr) {
      console.error('[selector-recommender] OpenRouter error:', aiErr.message);
      return res.status(502).json({
        error: 'AI service unavailable. Please try again later.',
        detail: aiErr.response?.data?.error || aiErr.message,
      });
    }

    const parsed = parseAIJson(content) || { raw_result: content };
    await persistAIResult('selector-recommender', req.user?.id, `selector:${failed_selector}`, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('[selector-recommender]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/anomaly-alerts
// Body: { data_points: Array<number|object>, historical_avg: number|object }
// ---------------------------------------------------------------------------
router.post('/anomaly-alerts', auth, async (req, res) => {
  try {
    const { data_points, historical_avg } = req.body;

    if (!Array.isArray(data_points) || data_points.length === 0) {
      return res.status(400).json({ error: "'data_points' must be a non-empty array" });
    }
    if (historical_avg === undefined || historical_avg === null) {
      return res.status(400).json({ error: "'historical_avg' is required" });
    }

    // Basic statistical pre-computation for context
    let numericPoints = data_points.filter((p) => typeof p === 'number');
    let statsContext = '';
    if (numericPoints.length > 0) {
      const sum = numericPoints.reduce((a, b) => a + b, 0);
      const mean = sum / numericPoints.length;
      const variance =
        numericPoints.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numericPoints.length;
      const stdDev = Math.sqrt(variance);
      statsContext = `Pre-computed stats: mean=${mean.toFixed(2)}, std_dev=${stdDev.toFixed(2)}, min=${Math.min(...numericPoints)}, max=${Math.max(...numericPoints)}`;
    }

    let content;
    try {
      content = await callAI([
        {
          role: 'user',
          content: `You are a data anomaly detection expert for web scraping monitoring systems.

Analyze the following data points and detect outliers compared to the historical average. Flag anything that looks unusual, missing, or outside expected bounds.

HISTORICAL AVERAGE: ${JSON.stringify(historical_avg)}
DATA POINTS (${data_points.length} points): ${JSON.stringify(data_points).substring(0, 3000)}
${statsContext ? `\nSTATISTICAL CONTEXT: ${statsContext}` : ''}

Detection methods to apply:
1. Z-score outliers (>2 std deviations from mean)
2. IQR-based outliers
3. Sudden spikes or drops vs historical avg
4. Missing/null values
5. Pattern breaks (sequences that deviate from trend)

Return a JSON alert list with exactly these fields:
{
  "total_data_points": ${data_points.length},
  "historical_avg": ${JSON.stringify(historical_avg)},
  "anomalies_detected": 0,
  "alert_level": "None",
  "alerts": [
    {
      "alert_id": 1,
      "type": "Spike",
      "severity": "High",
      "data_point_index": 5,
      "data_point_value": 89.5,
      "expected_range": "19.0 - 22.0",
      "deviation": "3.2x std dev",
      "description": "human-readable description",
      "recommended_action": "what to do about this alert"
    }
  ],
  "statistics": {
    "mean": 20.0,
    "std_deviation": 0.5,
    "min": 19.0,
    "max": 21.0,
    "outlier_count": 0,
    "outlier_percentage": 0
  },
  "trend": "Stable",
  "summary": "brief summary of findings",
  "next_check_recommendation": "when to check again"
}`,
        },
      ], { jsonMode: true });
    } catch (aiErr) {
      console.error('[anomaly-alerts] OpenRouter error:', aiErr.message);
      return res.status(502).json({
        error: 'AI service unavailable. Please try again later.',
        detail: aiErr.response?.data?.error || aiErr.message,
      });
    }

    const parsed = parseAIJson(content) || { raw_result: content };
    await persistAIResult('anomaly-alerts', req.user?.id, `points:${data_points.length}`, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('[anomaly-alerts]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
