const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const router = express.Router();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

router.post('/analyze-url', auth, async (req, res) => {
  try {
    const { url, description } = req.body;
    const response = await axios.post(OPENROUTER_URL, {
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
      messages: [{
        role: 'user',
        content: `Analyze this website URL and suggest a comprehensive web scraping strategy. URL: ${url}. Description: ${description || 'General scraping'}.
        
        Respond in this JSON format:
        {
          "website_analysis": { "type": "string", "domain": "string", "estimated_pages": number },
          "scraping_strategy": { "approach": "string", "selectors_suggested": [{"name": "string", "selector": "string", "description": "string"}], "pagination_method": "string" },
          "data_schema": [{"field": "string", "type": "string", "description": "string"}],
          "challenges": [{"issue": "string", "solution": "string"}],
          "schedule_recommendation": { "frequency": "string", "cron": "string", "reason": "string" },
          "estimated_data_volume": "string",
          "compliance_notes": ["string"]
        }`
      }]
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }
    });
    const content = response.data.choices[0].message.content;
    let parsed;
    try { parsed = JSON.parse(content); } catch { parsed = { raw_analysis: content }; }
    res.json(parsed);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/extract-data', auth, async (req, res) => {
  try {
    const { html_snippet, instruction } = req.body;
    const response = await axios.post(OPENROUTER_URL, {
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
      messages: [{
        role: 'user',
        content: `Extract structured data from this HTML snippet based on the instruction.
        Instruction: ${instruction || 'Extract all meaningful data'}
        HTML: ${(html_snippet || '').substring(0, 3000)}
        
        Respond in JSON format with extracted data fields.`
      }]
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }
    });
    const content = response.data.choices[0].message.content;
    let parsed;
    try { parsed = JSON.parse(content); } catch { parsed = { extracted_data: content }; }
    res.json(parsed);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clean-data', auth, async (req, res) => {
  try {
    const { data } = req.body;
    const response = await axios.post(OPENROUTER_URL, {
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
      messages: [{
        role: 'user',
        content: `Clean and normalize this scraped data. Fix dates, currencies, remove duplicates, standardize formats.
        Data: ${JSON.stringify(data).substring(0, 3000)}
        
        Respond with JSON: { "cleaned_data": [...], "changes_made": [...], "quality_score": number }`
      }]
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }
    });
    const content = response.data.choices[0].message.content;
    let parsed;
    try { parsed = JSON.parse(content); } catch { parsed = { cleaned_result: content }; }
    res.json(parsed);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
