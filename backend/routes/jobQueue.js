const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const pool = require('../models/db');
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

// Ensure job_queue table exists
const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_queue (
      id SERIAL PRIMARY KEY,
      job_type VARCHAR(100) NOT NULL,
      payload JSONB DEFAULT '{}',
      status VARCHAR(50) DEFAULT 'pending',
      result JSONB,
      error_message TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      started_at TIMESTAMP,
      completed_at TIMESTAMP
    )
  `);
};
ensureTable().catch(console.error);

// In-memory queue processing state
let isProcessing = false;

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

const processJob = async (job) => {
  await pool.query('UPDATE job_queue SET status = $1, started_at = NOW() WHERE id = $2', ['running', job.id]);

  try {
    let result = {};

    if (job.job_type === 'scrape_url') {
      const { url, instruction, schema } = job.payload;
      // Fetch HTML
      let html = '';
      try {
        const resp = await axios.get(url, {
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebScrapingAgent/1.0)' }
        });
        html = (resp.data || '').substring(0, 6000);
      } catch (e) { html = `[Failed to fetch: ${e.message}]`; }

      // AI extraction
      const content = await callAI([{
        role: 'user',
        content: `Extract data from this HTML. Instruction: ${instruction || 'Extract all meaningful data'}. ${schema ? 'Schema: ' + JSON.stringify(schema) : ''}. HTML: ${html}. Return JSON.`
      }], true);
      result = parseAIJson(content) || { extracted_data: content };
      result._url = url;
      result._html_length = html.length;

    } else if (job.job_type === 'analyze_url') {
      const { url, description } = job.payload;
      const content = await callAI([{
        role: 'user',
        content: `Analyze this URL for web scraping strategy: ${url}. Description: ${description || 'General'}. Return JSON with scraping_strategy, data_schema, challenges, schedule_recommendation.`
      }], true);
      result = parseAIJson(content) || { analysis: content };

    } else if (job.job_type === 'run_competitive_agent') {
      const { agent_id } = job.payload;
      const agentResult = await pool.query('SELECT * FROM competitive_agents WHERE id = $1', [agent_id]);
      if (agentResult.rows.length > 0) {
        const agent = agentResult.rows[0];
        const htmlParts = [];
        for (const url of (agent.target_urls || [])) {
          try {
            const resp = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            htmlParts.push(`--- ${url} ---\n${(resp.data || '').substring(0, 3000)}`);
          } catch (e) { htmlParts.push(`--- ${url} ---\n[Failed: ${e.message}]`); }
        }
        const content = await callAI([{
          role: 'user',
          content: `Competitive intelligence analysis for agent "${agent.name}". Analysis type: ${agent.analysis_type}. Content:\n${htmlParts.join('\n\n').substring(0, 8000)}\n\nReturn comprehensive JSON analysis.`
        }], true);
        result = parseAIJson(content) || { analysis: content };
        result._agent_id = agent_id;
      }

    } else {
      result = { message: `Unknown job type: ${job.job_type}`, payload: job.payload };
    }

    await pool.query(
      'UPDATE job_queue SET status = $1, result = $2, completed_at = NOW() WHERE id = $3',
      ['completed', JSON.stringify(result), job.id]
    );
  } catch (err) {
    await pool.query(
      'UPDATE job_queue SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
      ['failed', err.message, job.id]
    );
  }
};

// Process one job at a time
const processQueue = async () => {
  if (isProcessing) return;
  isProcessing = true;
  try {
    while (true) {
      const result = await pool.query(
        "SELECT * FROM job_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      );
      if (result.rows.length === 0) break;
      await processJob(result.rows[0]);
    }
  } finally {
    isProcessing = false;
  }
};

// POST /api/job-queue — enqueue a job
router.post('/', auth, async (req, res) => {
  try {
    const { job_type, payload } = req.body;
    if (!job_type) return res.status(400).json({ error: 'job_type is required' });

    const result = await pool.query(
      'INSERT INTO job_queue (job_type, payload, created_by) VALUES ($1, $2, $3) RETURNING *',
      [job_type, JSON.stringify(payload || {}), req.user.id]
    );
    const job = result.rows[0];

    // Trigger queue processing asynchronously
    processQueue().catch(console.error);

    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/job-queue — list jobs with pagination
router.get('/', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const params = [req.user.id];
    let whereExtra = '';
    if (req.query.status) {
      params.push(req.query.status);
      whereExtra = ` AND status = $${params.length}`;
    }

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total FROM job_queue WHERE created_by = $1${whereExtra}`, params),
      pool.query(
        `SELECT * FROM job_queue WHERE created_by = $1${whereExtra} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
    ]);

    const total = parseInt(countResult.rows[0].total);
    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/job-queue/:id — get single job
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM job_queue WHERE id = $1 AND created_by = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/job-queue/:id — cancel pending job
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE job_queue SET status = 'cancelled', completed_at = NOW() WHERE id = $1 AND created_by = $2 AND status = 'pending' RETURNING *",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found or not cancellable' });
    res.json({ message: 'Job cancelled', job: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
