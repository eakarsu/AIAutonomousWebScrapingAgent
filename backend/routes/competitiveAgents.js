const router = require('express').Router();
const auth = require('../middleware/auth');
const axios = require('axios');

router.use(auth);

const ai = async (prompt) => {
  const r = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
    messages: [{ role: 'user', content: prompt }]
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  const c = r.data.choices[0].message.content;
  try { return JSON.parse(c); } catch { return { analysis: c }; }
};

router.post('/analyze-competitor', async (req, res) => {
  try {
    const { competitor_url, competitor_name, focus_areas } = req.body;
    const result = await ai(`Analyze competitor "${competitor_name || competitor_url}". Focus areas: ${focus_areas || 'general'}. Return JSON with: company_overview, strengths (array), weaknesses (array), market_position, key_products (array with name, description, pricing), online_presence_score (0-100), technology_stack (array), content_strategy, recommendations (array).`);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/analyze-market', async (req, res) => {
  try {
    const { industry, region, timeframe } = req.body;
    const result = await ai(`Analyze the ${industry} market in ${region || 'global'}. Timeframe: ${timeframe || 'current'}. Return JSON with: market_size, growth_rate, key_trends (array with trend, impact, timeline), major_players (array with name, market_share), opportunities (array), threats (array), entry_barriers (array), regulatory_factors (array), forecast.`);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/generate-swot', async (req, res) => {
  try {
    const { company, industry, context } = req.body;
    const result = await ai(`Generate a SWOT analysis for "${company}" in the ${industry || 'technology'} industry. Context: ${context || 'general'}. Return JSON with: strengths (array with item, details, impact_score), weaknesses (array with item, details, impact_score), opportunities (array with item, details, timeline, potential_value), threats (array with item, details, likelihood, mitigation), strategic_recommendations (array), competitive_advantage, overall_assessment.`);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
