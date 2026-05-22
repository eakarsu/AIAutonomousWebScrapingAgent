/**
 * routes/cuaFeat_clickPlanner.js
 * CUA — AI Click-Target Prediction from Screen State
 * 18 CRUD + 16 AI verbs  →  34 endpoints total
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../models/db');

const TABLE = 'cua_click_plans';
const AI_RATE_MAP = new Map();
const AI_LIMIT = 20;
const AI_WINDOW = 60 * 60 * 1000;

function aiRateLimit(req, res, next) {
  const key = req.user ? `u:${req.user.id}` : `i:${req.ip}`;
  const now = Date.now();
  const e = AI_RATE_MAP.get(key) || { count: 0, resetAt: now + AI_WINDOW };
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + AI_WINDOW; }
  e.count++;
  AI_RATE_MAP.set(key, e);
  if (e.count > AI_LIMIT) return res.status(429).json({ error: 'AI rate limit: 20/hour' });
  next();
}

async function callOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { result: null, stub: true, note: 'OPENROUTER_API_KEY not set' };
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet', messages: [{ role: 'user', content: prompt }] })
  });
  const j = await r.json();
  return { result: j.choices?.[0]?.message?.content || '', model: j.model, usage: j.usage };
}

function parseAI(c) {
  if (!c) return { raw: '' };
  const m = c.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1].trim()); } catch (_) {} }
  try { return JSON.parse(c); } catch (_) {}
  const m2 = c.match(/\{[\s\S]*\}/);
  if (m2) { try { return JSON.parse(m2[0]); } catch (_) {} }
  return { raw_response: c };
}

router.use(auth);

/* ── 18 CRUD ─────────────────────────────────────────────── */

// 1. list
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    const { rows: cnt } = await pool.query(`SELECT COUNT(*) FROM ${TABLE} WHERE archived=false`);
    res.json({ data: rows, pagination: { page, limit, total: parseInt(cnt[0].count), totalPages: Math.ceil(parseInt(cnt[0].count) / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. count
router.get('/count', async (req, res) => {
  try {
    const where = req.query.session_id ? `WHERE session_id=$1 AND archived=false` : `WHERE archived=false`;
    const params = req.query.session_id ? [req.query.session_id] : [];
    const { rows } = await pool.query(`SELECT COUNT(*) FROM ${TABLE} ${where}`, params);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. search
router.get('/search', async (req, res) => {
  try {
    const q = `%${req.query.q || ''}%`;
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false AND (target_description ILIKE $1 OR element_type ILIKE $1 OR xpath_selector ILIKE $1) ORDER BY created_at DESC LIMIT 20`, [q]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. stats-summary
router.get('/stats/summary', async (req, res) => {
  try {
    const { rows: byStatus } = await pool.query(`SELECT status, COUNT(*) FROM ${TABLE} WHERE archived=false GROUP BY status`);
    const { rows: byType } = await pool.query(`SELECT element_type, COUNT(*) FROM ${TABLE} WHERE archived=false GROUP BY element_type`);
    const { rows: avgConf } = await pool.query(`SELECT AVG(confidence_score) as avg_confidence FROM ${TABLE} WHERE archived=false`);
    res.json({ byStatus, byElementType: byType, avgConfidence: avgConf[0].avg_confidence });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. export-csv
router.get('/export/csv', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, session_id, target_description, predicted_x, predicted_y, element_type, confidence_score, status, created_at FROM ${TABLE} WHERE archived=false ORDER BY created_at DESC`);
    if (!rows.length) return res.status(200).send('No data');
    const fields = Object.keys(rows[0]);
    const header = fields.join(',');
    const lines = rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="click_plans.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. by-session
router.get('/by-session/:sessionId', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE session_id=$1 AND archived=false ORDER BY created_at DESC`, [req.params.sessionId]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. by-capture
router.get('/by-capture/:captureId', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE capture_id=$1 AND archived=false ORDER BY created_at DESC`, [req.params.captureId]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8. batch-create
router.post('/batch', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items[] required' });
    const created = [];
    for (const item of items) {
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, capture_id, target_description, element_type, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [item.session_id, item.capture_id, item.target_description, item.element_type, req.user?.id]);
      created.push(rows[0]);
    }
    res.status(201).json({ data: created, count: created.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 9. batch-update
router.put('/batch', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items[] required' });
    const results = [];
    for (const { id, ...fields } of items) {
      const keys = Object.keys(fields);
      if (!keys.length) { results.push({ id, error: 'no fields' }); continue; }
      const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
      const { rows } = await pool.query(`UPDATE ${TABLE} SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, ...keys.map(k => fields[k])]);
      results.push(rows[0] || { id, error: 'not found' });
    }
    res.json({ data: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 10. batch-delete
router.delete('/batch', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids[] required' });
    const { rowCount } = await pool.query(`UPDATE ${TABLE} SET archived=true, updated_at=NOW() WHERE id=ANY($1)`, [ids]);
    res.json({ archived: rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 11. import-csv
router.post('/import/csv', async (req, res) => {
  try {
    const { csv } = req.body;
    if (!csv) return res.status(400).json({ error: 'csv field required' });
    const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return res.status(400).json({ error: 'Need header + 1 row' });
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const created = [];
    for (const line of lines.slice(1)) {
      const vals = (line.match(/(".*?"|[^,]+)/g) || []).map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? null; });
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, target_description, created_by) VALUES ($1,$2,$3) RETURNING *`, [obj.session_id, obj.target_description, req.user?.id]);
      created.push(rows[0]);
    }
    res.status(201).json({ data: created, count: created.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 12. get by id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. create
router.post('/', async (req, res) => {
  try {
    const { session_id, capture_id, target_description, element_type, status = 'pending' } = req.body;
    const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, capture_id, target_description, element_type, status, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [session_id, capture_id, target_description, element_type, status, req.user?.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 14. update
router.put('/:id', async (req, res) => {
  try {
    const fields = req.body;
    const keys = Object.keys(fields);
    if (!keys.length) return res.status(400).json({ error: 'No fields' });
    const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
    const { rows } = await pool.query(`UPDATE ${TABLE} SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, ...keys.map(k => fields[k])]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 15. soft-delete
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=true, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 16. archive
router.post('/:id/archive', async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=true, status='cancelled', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. restore
router.post('/:id/restore', async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=false, status='pending', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. history
router.get('/:id/history', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── 16 AI verbs ─────────────────────────────────────────── */

async function loadPlan(id, res) {
  const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [id]);
  if (!rows.length) { res.status(404).json({ error: 'Click plan not found' }); return null; }
  return rows[0];
}

router.post('/ai/predict-click-target', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Predict the most likely click target for this automation intent.\nPlan: ${JSON.stringify(p)}\nScreen OCR context: ${req.body.ocrContext || 'none'}\nRespond JSON: { "x": number, "y": number, "selector": "...", "confidence": "high|medium|low", "rationale": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET predicted_x=$1, predicted_y=$2, confidence_score=$3, updated_at=NOW() WHERE id=$4`, [parsed.x || null, parsed.y || null, parsed.confidence === 'high' ? 0.9 : parsed.confidence === 'medium' ? 0.6 : 0.3, p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-click-coordinates', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Suggest precise click coordinates for the target element in this plan.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "primary_coords": {"x": number, "y": number}, "fallback_coords": [{"x": number, "y": number}], "click_type": "single|double|right" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-element-type', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Classify the type of UI element this click plan targets.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "element_type": "button|link|input|checkbox|radio|dropdown|tab|image|icon|other", "is_interactive": true|false, "html_tag": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET element_type=$1, updated_at=NOW() WHERE id=$2`, [parsed.element_type || p.element_type, p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-target-confidence', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Score the confidence level for the target element identification in this click plan.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "confidence_score": 0-1, "confidence_tier": "high|medium|low|uncertain", "factors": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET confidence_score=$1, updated_at=NOW() WHERE id=$2`, [parsed.confidence_score || null, p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-ambiguous-target', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Detect if the click target is ambiguous (multiple similar elements).\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "is_ambiguous": true|false, "ambiguity_reason": "...", "matching_count": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET is_ambiguous=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.is_ambiguous, p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-disambiguation', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Recommend a strategy to disambiguate the click target.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "strategy": "...", "additional_selector": "...", "parent_context": "...", "steps": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET disambiguation_hint=$1, updated_at=NOW() WHERE id=$2`, [parsed.strategy || '', p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-xpath', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Generate a robust XPath selector for this click target.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "xpath": "...", "relative_xpath": "...", "robustness_score": 0-10, "notes": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET xpath_selector=$1, updated_at=NOW() WHERE id=$2`, [parsed.xpath || '', p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-target-clickable', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Validate whether the planned click target is currently clickable.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "is_clickable": true|false, "reasons": [...], "prerequisites": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-alternate-target', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Suggest an alternate click target if the primary target is not available.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "alternate_target": "...", "alternate_selector": "...", "similarity_score": 0-1, "rationale": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET alternate_target=$1, updated_at=NOW() WHERE id=$2`, [parsed.alternate_target || '', p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-misclick-risk', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Predict the risk of a misclick for this planned action.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "misclick_risk": 0-1, "risk_factors": [...], "mitigation": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET misclick_risk=$1, updated_at=NOW() WHERE id=$2`, [parsed.misclick_risk || null, p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-button-purpose', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Classify the purpose of the button or interactive element in this click plan.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "purpose": "submit|cancel|navigate|expand|close|confirm|search|other", "is_destructive": true|false, "label": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET button_purpose=$1, updated_at=NOW() WHERE id=$2`, [parsed.purpose || '', p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-dynamic-element', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Detect if the click target is a dynamically rendered element that requires special handling.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "is_dynamic": true|false, "dynamic_type": "lazy-loaded|reactive|shadow-dom|iframe|canvas|other", "handling_strategy": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET is_dynamic=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.is_dynamic, p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-wait-before-click', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Suggest the appropriate wait condition before executing this click.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "wait_for": "element-visible|network-idle|timeout|dom-stable", "timeout_ms": number, "poll_interval_ms": number }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-target-stability', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Score how stable the click target selector is across page loads and navigation.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "stability_score": 0-1, "fragility_factors": [...], "recommendations": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET target_stability=$1, updated_at=NOW() WHERE id=$2`, [parsed.stability_score || null, p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-target-selector-strategy', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Recommend the best selector strategy for reliably targeting this element.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "strategy": "xpath|css|text|aria|id|custom", "primary_selector": "...", "fallback_selector": "...", "rationale": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET selector_strategy=$1, css_selector=$2, updated_at=NOW() WHERE id=$3`, [parsed.strategy || '', parsed.primary_selector || '', p.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-click-plan', aiRateLimit, async (req, res) => {
  try {
    const p = await loadPlan(req.body.planId, res); if (!p) return;
    const ai = await callOpenRouter(`Summarize this click plan in plain language for logging and review.\nPlan: ${JSON.stringify(p)}\nRespond JSON: { "summary": "...", "risk_level": "low|medium|high", "recommended_action": "proceed|review|abort" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
