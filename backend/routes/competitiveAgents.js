const express = require('express');
const axios = require('axios');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const router = express.Router();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022';

// parseAIJson — robust JSON extraction from AI responses
function parseAIJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const stripped = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch (e) {}
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) { try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {} }
  return null;
}

// Ensure competitive agent tables exist
const ensureTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS competitive_agents (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      target_urls TEXT[] DEFAULT '{}',
      frequency VARCHAR(50) DEFAULT 'daily',
      analysis_type VARCHAR(100) DEFAULT 'general',
      status VARCHAR(50) DEFAULT 'active',
      last_run_at TIMESTAMP,
      next_run_at TIMESTAMP,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS competitive_results (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER REFERENCES competitive_agents(id) ON DELETE CASCADE,
      analysis_type VARCHAR(100),
      target_urls TEXT[],
      html_content TEXT,
      ai_analysis JSONB,
      raw_response TEXT,
      status VARCHAR(50) DEFAULT 'completed',
      error_message TEXT,
      run_at TIMESTAMP DEFAULT NOW()
    )
  `);
};
ensureTables().catch(console.error);

// Helper: call AI
const callAI = async (messages, jsonMode = false) => {
  const payload = { model: MODEL, messages };
  if (jsonMode) payload.response_format = { type: 'json_object' };
  const response = await axios.post(OPENROUTER_URL, payload, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
      'X-Title': 'AI Autonomous Web Scraping Agent',
    },
    timeout: 60000,
  });
  return response.data.choices[0].message.content;
};

// Helper: fetch HTML from URL
const fetchHTML = async (url) => {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CompetitiveIntelligenceBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 5
    });
    return response.data?.substring(0, 8000) || '';
  } catch (err) {
    return `[Failed to fetch ${url}: ${err.message}]`;
  }
};

// Helper: compute next_run_at based on frequency
const computeNextRun = (frequency) => {
  const now = new Date();
  switch (frequency) {
    case 'hourly': return new Date(now.getTime() + 60 * 60 * 1000);
    case 'daily': return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'weekly': return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default: return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
};

// GET /api/competitive-agents — list all agents for user
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ca.*, COUNT(cr.id) as result_count
       FROM competitive_agents ca
       LEFT JOIN competitive_results cr ON ca.id = cr.agent_id
       WHERE ca.created_by = $1
       GROUP BY ca.id
       ORDER BY ca.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/competitive-agents/:id — get single agent
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM competitive_agents WHERE id = $1 AND created_by = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/competitive-agents — create agent
router.post('/', auth, async (req, res) => {
  try {
    const { name, target_urls, frequency, analysis_type } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const urls = Array.isArray(target_urls) ? target_urls : (target_urls ? [target_urls] : []);
    const next_run_at = computeNextRun(frequency || 'daily');
    const result = await pool.query(
      `INSERT INTO competitive_agents (name, target_urls, frequency, analysis_type, created_by, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, urls, frequency || 'daily', analysis_type || 'general', req.user.id, next_run_at]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/competitive-agents/:id — update agent
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, target_urls, frequency, analysis_type, status } = req.body;
    const urls = Array.isArray(target_urls) ? target_urls : (target_urls ? [target_urls] : undefined);
    const result = await pool.query(
      `UPDATE competitive_agents
       SET name = COALESCE($1, name),
           target_urls = COALESCE($2, target_urls),
           frequency = COALESCE($3, frequency),
           analysis_type = COALESCE($4, analysis_type),
           status = COALESCE($5, status),
           updated_at = NOW()
       WHERE id = $6 AND created_by = $7
       RETURNING *`,
      [name, urls, frequency, analysis_type, status, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/competitive-agents/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM competitive_agents WHERE id = $1 AND created_by = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json({ message: 'Agent deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/competitive-agents/:id/run — trigger manual run
router.post('/:id/run', auth, async (req, res) => {
  try {
    const agentResult = await pool.query(
      'SELECT * FROM competitive_agents WHERE id = $1 AND created_by = $2',
      [req.params.id, req.user.id]
    );
    if (agentResult.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    const agent = agentResult.rows[0];

    // Fetch HTML from all target URLs
    const htmlParts = [];
    for (const url of (agent.target_urls || [])) {
      const html = await fetchHTML(url);
      htmlParts.push(`--- Content from: ${url} ---\n${html}`);
    }
    const combinedHTML = htmlParts.join('\n\n');

    // Build analysis prompt based on analysis_type
    const analysisPrompts = {
      general: `Analyze this web content for competitive intelligence. Extract: key products/services, pricing info, technology stack, content strategy, market positioning, unique value propositions, contact info, social presence. Return comprehensive JSON.`,
      pricing: `Extract all pricing information from this web content. Find: product names, price points, pricing tiers, discounts, free trials, pricing strategy. Return JSON with prices array and pricing_strategy.`,
      technology: `Identify the technology stack from this web content. Look for: frameworks, libraries, CDNs, analytics tools, chat widgets, payment processors, hosting indicators. Return JSON with technology categories.`,
      content: `Analyze the content strategy. Find: blog topics, content types, publishing frequency hints, SEO keywords, call-to-actions, target audience. Return JSON with content analysis.`,
      seo: `Extract SEO data from this HTML. Find: title tags, meta descriptions, H1-H6 headings, keywords, internal link structure, schema markup. Return JSON with seo_data.`
    };

    const prompt = `You are a competitive intelligence expert. ${analysisPrompts[agent.analysis_type] || analysisPrompts.general}

AGENT: ${agent.name}
ANALYSIS TYPE: ${agent.analysis_type}
TARGET URLs: ${(agent.target_urls || []).join(', ')}

WEB CONTENT:
${combinedHTML.substring(0, 12000)}

Provide detailed, actionable competitive intelligence. Return only valid JSON.`;

    const aiResponse = await callAI([{ role: 'user', content: prompt }], true);
    let parsed = parseAIJson(aiResponse) || { analysis: aiResponse };

    const next_run_at = computeNextRun(agent.frequency);

    // Save result and update agent
    const [insertResult] = await Promise.all([
      pool.query(
        `INSERT INTO competitive_results (agent_id, analysis_type, target_urls, html_content, ai_analysis, raw_response)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [agent.id, agent.analysis_type, agent.target_urls, combinedHTML.substring(0, 5000), JSON.stringify(parsed), aiResponse]
      ),
      pool.query(
        `UPDATE competitive_agents SET last_run_at = NOW(), next_run_at = $1, updated_at = NOW() WHERE id = $2`,
        [next_run_at, agent.id]
      )
    ]);

    res.json({
      result: insertResult.rows[0],
      analysis: parsed,
      next_run_at
    });
  } catch (err) {
    console.error(err);
    // Save error result
    try {
      await pool.query(
        `INSERT INTO competitive_results (agent_id, analysis_type, target_urls, status, error_message)
         VALUES ($1, $2, $3, 'failed', $4)`,
        [req.params.id, 'error', [], err.message]
      );
    } catch {}
    res.status(500).json({ error: err.message });
  }
});

// GET /api/competitive-agents/:id/results — list results with pagination
router.get('/:id/results', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Verify agent belongs to user
    const agentCheck = await pool.query(
      'SELECT id FROM competitive_agents WHERE id = $1 AND created_by = $2',
      [req.params.id, req.user.id]
    );
    if (agentCheck.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const [results, countResult] = await Promise.all([
      pool.query(
        `SELECT id, agent_id, analysis_type, target_urls, ai_analysis, status, error_message, run_at
         FROM competitive_results WHERE agent_id = $1
         ORDER BY run_at DESC LIMIT $2 OFFSET $3`,
        [req.params.id, parseInt(limit), offset]
      ),
      pool.query('SELECT COUNT(*) as total FROM competitive_results WHERE agent_id = $1', [req.params.id])
    ]);

    res.json({
      results: results.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy endpoints (analyze-competitor, analyze-market, generate-swot) — kept for backward compatibility
const ai = async (prompt) => {
  const c = await callAI([{ role: 'user', content: prompt }], true);
  return parseAIJson(c) || { analysis: c };
};

router.post('/analyze-competitor', auth, async (req, res) => {
  try {
    const { competitor_url, competitor_name, focus_areas } = req.body;
    const result = await ai(`Analyze competitor "${competitor_name || competitor_url}". Focus areas: ${focus_areas || 'general'}. Return JSON with: company_overview, strengths (array), weaknesses (array), market_position, key_products (array with name, description, pricing), online_presence_score (0-100), technology_stack (array), content_strategy, recommendations (array).`);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/analyze-market', auth, async (req, res) => {
  try {
    const { industry, region, timeframe } = req.body;
    const result = await ai(`Analyze the ${industry} market in ${region || 'global'}. Timeframe: ${timeframe || 'current'}. Return JSON with: market_size, growth_rate, key_trends (array with trend, impact, timeline), major_players (array with name, market_share), opportunities (array), threats (array), entry_barriers (array), regulatory_factors (array), forecast.`);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/generate-swot', auth, async (req, res) => {
  try {
    const { company, industry, context } = req.body;
    const result = await ai(`Generate a SWOT analysis for "${company}" in the ${industry || 'technology'} industry. Context: ${context || 'general'}. Return JSON with: strengths (array with item, details, impact_score), weaknesses (array with item, details, impact_score), opportunities (array with item, details, timeline, potential_value), threats (array with item, details, likelihood, mitigation), strategic_recommendations (array), competitive_advantage, overall_assessment.`);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
