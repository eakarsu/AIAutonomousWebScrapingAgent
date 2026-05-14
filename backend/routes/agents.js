/**
 * /backend/routes/agents.js
 *
 * AI agent endpoints for the Autonomous Web Scraping Agent.
 * All routes require JWT auth. AI routes are subject to aiLimiter
 * applied at the /api/agents prefix in server.js.
 *
 * Endpoints:
 *   POST /api/agents/analyze-url
 *   POST /api/agents/extract-data
 *   POST /api/agents/clean-data
 *   POST /api/agents/competitive-intel
 */

const express = require('express');
const axios = require('axios');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022';

// ---------------------------------------------------------------------------
// Ensure ai_results table exists
// ---------------------------------------------------------------------------
pool.query(`
  CREATE TABLE IF NOT EXISTS ai_results (
    id SERIAL PRIMARY KEY,
    endpoint VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    input_summary TEXT,
    result JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch(console.error);

// ---------------------------------------------------------------------------
// Manual input validation helpers
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

function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// parseAIJson — robust JSON extraction from AI responses
// ---------------------------------------------------------------------------
function parseAIJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const stripped = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch (e) {}
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) { try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {} }
  return null;
}

// ---------------------------------------------------------------------------
// persistAIResult — save AI analysis to ai_results table
// ---------------------------------------------------------------------------
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
// OpenRouter call with graceful fallback
// ---------------------------------------------------------------------------

async function callAI(messages, options = {}) {
  const { model = MODEL, jsonMode = false } = options;
  const payload = {
    model,
    messages,
  };
  if (jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

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

// ---------------------------------------------------------------------------
// POST /api/agents/analyze-url
// Body: { url, description }
// ---------------------------------------------------------------------------
router.post('/analyze-url', auth, async (req, res) => {
  try {
    const { url, description } = req.body;

    const fieldErr = requireFields(req.body, ['url']);
    if (fieldErr) return res.status(400).json({ error: fieldErr });

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: "'url' must be a valid URL" });
    }

    let content;
    try {
      content = await callAI([
        {
          role: 'user',
          content: `Analyze this website URL and suggest a comprehensive web scraping strategy.
URL: ${url}
Description: ${description || 'General scraping'}

Respond in this JSON format:
{
  "website_analysis": { "type": "string", "domain": "string", "estimated_pages": number },
  "scraping_strategy": {
    "approach": "string",
    "selectors_suggested": [{"name": "string", "selector": "string", "description": "string"}],
    "pagination_method": "string"
  },
  "data_schema": [{"field": "string", "type": "string", "description": "string"}],
  "challenges": [{"issue": "string", "solution": "string"}],
  "schedule_recommendation": { "frequency": "string", "cron": "string", "reason": "string" },
  "estimated_data_volume": "string",
  "compliance_notes": ["string"]
}`,
        },
      ], { jsonMode: true });
    } catch (aiErr) {
      console.error('[analyze-url] OpenRouter error:', aiErr.message);
      return res.status(502).json({
        error: 'AI service unavailable. Please try again later.',
        detail: aiErr.response?.data?.error || aiErr.message,
      });
    }

    const parsed = parseAIJson(content) || { raw_analysis: content };
    await persistAIResult('analyze-url', req.user?.id, url, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('[analyze-url]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/extract-data
// Body: { html_snippet, instruction, schema?, structured_output? }
// ---------------------------------------------------------------------------
router.post('/extract-data', auth, async (req, res) => {
  try {
    const { html_snippet, instruction, schema, structured_output } = req.body;

    const fieldErr = requireFields(req.body, ['html_snippet']);
    if (fieldErr) return res.status(400).json({ error: fieldErr });

    if (typeof html_snippet !== 'string' || html_snippet.trim().length === 0) {
      return res.status(400).json({ error: "'html_snippet' must be a non-empty string" });
    }

    let content;

    try {
      if (schema || structured_output) {
        const schemaStr = schema
          ? JSON.stringify(schema, null, 2)
          : 'infer a suitable JSON schema from the instruction';

        content = await callAI(
          [
            {
              role: 'user',
              content: `You are a structured data extraction expert. Extract data from the HTML snippet and return it as valid JSON matching the provided schema.

EXTRACTION INSTRUCTION: ${instruction || 'Extract all meaningful data'}

TARGET SCHEMA:
${schemaStr}

HTML CONTENT:
${html_snippet.substring(0, 4000)}

Return ONLY a valid JSON object that exactly matches the schema structure. Fill in all fields found in the HTML. Use null for missing optional fields. For arrays, return all matching items found.`,
            },
          ],
          { jsonMode: true }
        );

        const parsed = parseAIJson(content) || { extracted_data: content };
        const result = { ...parsed, _extraction_mode: 'structured', _schema_used: !!schema };
        await persistAIResult('extract-data', req.user?.id, `html[${html_snippet.length}b] instruction:${instruction || 'none'}`, result);
        return res.json(result);
      }

      // Standard extraction mode
      content = await callAI([
        {
          role: 'user',
          content: `Extract structured data from this HTML snippet based on the instruction.
Instruction: ${instruction || 'Extract all meaningful data'}
HTML: ${html_snippet.substring(0, 3000)}

Respond in JSON format with extracted data fields.`,
        },
      ], { jsonMode: true });
    } catch (aiErr) {
      console.error('[extract-data] OpenRouter error:', aiErr.message);
      return res.status(502).json({
        error: 'AI service unavailable. Please try again later.',
        detail: aiErr.response?.data?.error || aiErr.message,
      });
    }

    const parsed = parseAIJson(content) || { extracted_data: content };
    await persistAIResult('extract-data', req.user?.id, `html[${html_snippet.length}b]`, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('[extract-data]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/clean-data
// Body: { data }
// ---------------------------------------------------------------------------
router.post('/clean-data', auth, async (req, res) => {
  try {
    const { data } = req.body;

    if (data === undefined || data === null) {
      return res.status(400).json({ error: "'data' is required" });
    }

    let content;
    try {
      content = await callAI([
        {
          role: 'user',
          content: `Clean and normalize this scraped data. Fix dates, currencies, remove duplicates, standardize formats.
Data: ${JSON.stringify(data).substring(0, 3000)}

Respond with JSON: { "cleaned_data": [...], "changes_made": [...], "quality_score": number }`,
        },
      ], { jsonMode: true });
    } catch (aiErr) {
      console.error('[clean-data] OpenRouter error:', aiErr.message);
      return res.status(502).json({
        error: 'AI service unavailable. Please try again later.',
        detail: aiErr.response?.data?.error || aiErr.message,
      });
    }

    const parsed = parseAIJson(content) || { cleaned_result: content };
    await persistAIResult('clean-data', req.user?.id, `records:${Array.isArray(data) ? data.length : 1}`, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('[clean-data]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/competitive-intel
// Body: { urls: string[], competitor_name: string }
// ---------------------------------------------------------------------------
router.post('/competitive-intel', auth, async (req, res) => {
  try {
    const { urls, competitor_name } = req.body;

    const fieldErr = requireFields(req.body, ['competitor_name']);
    if (fieldErr) return res.status(400).json({ error: fieldErr });

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: "'urls' must be a non-empty array of strings" });
    }

    for (const u of urls) {
      if (!isValidUrl(u)) {
        return res.status(400).json({ error: `Invalid URL in urls array: '${u}'` });
      }
    }

    // Attempt to fetch HTML from each URL (gracefully skip failures)
    const fetchedPages = [];
    for (const url of urls.slice(0, 5)) { // cap at 5 URLs
      try {
        const resp = await axios.get(url, {
          timeout: 12000,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; CompetitiveIntelBot/1.0; +https://example.com)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          maxRedirects: 5,
        });
        const html = (resp.data || '').toString().substring(0, 5000);
        fetchedPages.push({ url, html, success: true });
      } catch (fetchErr) {
        fetchedPages.push({
          url,
          html: `[Failed to fetch: ${fetchErr.message}]`,
          success: false,
        });
      }
    }

    const pagesSummary = fetchedPages
      .map(
        (p) =>
          `--- ${p.url} (${p.success ? 'fetched' : 'failed'}) ---\n${p.html}`
      )
      .join('\n\n');

    let content;
    try {
      content = await callAI([
        {
          role: 'user',
          content: `You are a competitive intelligence analyst. Analyze the following web content from "${competitor_name}" and provide comprehensive competitive intelligence.

COMPETITOR: ${competitor_name}
ANALYZED URLs: ${urls.join(', ')}

WEB CONTENT:
${pagesSummary.substring(0, 10000)}

Provide a detailed JSON response with exactly these fields:
{
  "competitor_name": "${competitor_name}",
  "analyzed_urls": ${JSON.stringify(urls)},
  "scrape_strategy": {
    "recommended_approach": "<description>",
    "key_selectors": [{"name": "string", "selector": "string", "data_type": "string"}],
    "javascript_heavy": true,
    "pagination_detected": false,
    "login_required": false,
    "recommended_frequency": "daily"
  },
  "data_comparison": {
    "products_services": [{"name": "string", "description": "string", "price": "string"}],
    "pricing_tiers": ["string"],
    "key_features": ["string"],
    "technology_stack": ["string"],
    "unique_value_propositions": ["string"]
  },
  "market_insights": {
    "market_positioning": "<description>",
    "target_audience": "<description>",
    "content_strategy": "<description>",
    "seo_keywords": ["string"],
    "social_channels": ["string"],
    "estimated_traffic_level": "Medium"
  },
  "competitive_strengths": ["string"],
  "competitive_weaknesses": ["string"],
  "opportunities_for_you": ["string"],
  "threats_from_competitor": ["string"],
  "recommended_actions": [
    {
      "action": "string",
      "priority": "High",
      "rationale": "string"
    }
  ],
  "data_freshness_score": 80,
  "analysis_confidence": "Medium",
  "pages_successfully_scraped": ${fetchedPages.filter((p) => p.success).length},
  "pages_failed": ${fetchedPages.filter((p) => !p.success).length}
}`,
        },
      ], { jsonMode: true });
    } catch (aiErr) {
      console.error('[competitive-intel] OpenRouter error:', aiErr.message);
      return res.status(502).json({
        error: 'AI service unavailable. Please try again later.',
        detail: aiErr.response?.data?.error || aiErr.message,
        pages_fetched: fetchedPages.filter((p) => p.success).length,
        pages_failed: fetchedPages.filter((p) => !p.success).length,
      });
    }

    const result = parseAIJson(content) || { raw_analysis: content };
    await persistAIResult('competitive-intel', req.user?.id, `competitor:${competitor_name}`, result);
    res.json(result);
  } catch (err) {
    console.error('[competitive-intel]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
