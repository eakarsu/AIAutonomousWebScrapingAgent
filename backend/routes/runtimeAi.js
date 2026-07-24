'use strict';

const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../models/db');

const router = express.Router();

router.post('/crawl-readiness', auth, async (req, res) => {
  try {
    const context = typeof req.body?.context === 'string' ? req.body.context.trim() : '';
    if (context.length < 10 || context.length > 8000) {
      return res.status(400).json({ error: 'context must contain 10 to 8000 characters' });
    }
    const baseUrl = process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL;
    const model = process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL;
    if (baseUrl !== 'https://openrouter.ai/api/v1' || !process.env.OPENROUTER_API_KEY || !model) {
      return res.status(503).json({ error: 'Canonical OpenRouter configuration is required' });
    }

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.CLIENT_URL || 'http://127.0.0.1',
        'X-Title': 'AI Autonomous Web Scraping Agent',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Assess a governed web-crawling plan. Cover authorization, robots and rate-limit compliance, extraction quality, schema drift, privacy, provenance, and safe retry behavior.' },
          { role: 'user', content: context },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await upstream.json();
    if (!upstream.ok) throw new Error(data.error?.message || `OpenRouter returned ${upstream.status}`);
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('OpenRouter returned empty content');

    const providerReceipt = { id: data.id, model: data.model || model, created: data.created, usage: data.usage };
    const stored = await pool.query(
      `INSERT INTO runtime_ai_results (user_id, feature, input, content, model, provider_receipt)
       VALUES ($1, 'crawl-readiness', $2, $3, $4, $5) RETURNING id, created_at`,
      [req.user.id, { context }, content, providerReceipt.model, providerReceipt],
    );
    return res.json({ content, model: providerReceipt.model, providerReceipt, persisted: stored.rows[0] });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

module.exports = router;
