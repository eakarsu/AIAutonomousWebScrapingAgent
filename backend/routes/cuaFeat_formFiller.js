/**
 * routes/cuaFeat_formFiller.js
 * CUA — Form Field Detection, Fill, Validation, Submit
 * 18 CRUD + 16 AI verbs  →  34 endpoints total
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../models/db');

const TABLE = 'cua_form_fills';
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
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false AND (form_url ILIKE $1 OR form_purpose ILIKE $1) ORDER BY created_at DESC LIMIT 20`, [q]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. stats-summary
router.get('/stats/summary', async (req, res) => {
  try {
    const { rows: byPurpose } = await pool.query(`SELECT form_purpose, COUNT(*) FROM ${TABLE} WHERE archived=false GROUP BY form_purpose`);
    const { rows: captchaStats } = await pool.query(`SELECT COUNT(*) as with_captcha FROM ${TABLE} WHERE archived=false AND captcha_detected=true`);
    const { rows: successRate } = await pool.query(`SELECT COUNT(*) FILTER (WHERE submit_success=true) as success, COUNT(*) as total FROM ${TABLE} WHERE archived=false`);
    res.json({ byPurpose, captchaCount: parseInt(captchaStats[0].with_captcha), successRate: successRate[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. export-csv
router.get('/export/csv', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, session_id, form_url, form_purpose, captcha_detected, is_multi_step, complexity_score, submit_success, created_at FROM ${TABLE} WHERE archived=false ORDER BY created_at DESC`);
    if (!rows.length) return res.status(200).send('No data');
    const fields = Object.keys(rows[0]);
    const header = fields.join(',');
    const lines = rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="form_fills.csv"');
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

// 7. by-purpose
router.get('/by-purpose/:purpose', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE form_purpose=$1 AND archived=false ORDER BY created_at DESC`, [req.params.purpose]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, form_url, form_purpose, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [item.session_id, item.form_url, item.form_purpose, req.user?.id]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, form_url, form_purpose, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [obj.session_id, obj.form_url, obj.form_purpose, req.user?.id]);
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
    const { session_id, capture_id, form_url, form_purpose } = req.body;
    const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, capture_id, form_url, form_purpose, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [session_id, capture_id, form_url, form_purpose, req.user?.id]);
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
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=true, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. restore
router.post('/:id/restore', async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=false, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
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

async function loadFill(id, res) {
  const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [id]);
  if (!rows.length) { res.status(404).json({ error: 'Form fill not found' }); return null; }
  return rows[0];
}

router.post('/ai/detect-field-type', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const { fieldHtml } = req.body;
    const ai = await callOpenRouter(`Detect the type of this form field.\nField HTML/description: ${fieldHtml}\nForm context: ${JSON.stringify(f)}\nRespond JSON: { "field_type": "text|email|password|number|date|select|checkbox|radio|file|textarea|hidden|other", "input_format": "...", "validation_pattern": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-field-value', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const { fieldName, fieldType } = req.body;
    const ai = await callOpenRouter(`Suggest an appropriate value for this form field.\nField name: ${fieldName}\nField type: ${fieldType}\nForm: ${JSON.stringify(f)}\nRespond JSON: { "suggested_value": "...", "format_notes": "...", "alternatives": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-field-format', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const { fieldName, value } = req.body;
    const ai = await callOpenRouter(`Validate if this value matches the expected format for the form field.\nField: ${fieldName}\nValue: ${value}\nForm context: ${JSON.stringify(f)}\nRespond JSON: { "is_valid": true|false, "errors": [...], "suggested_correction": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-required-field', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const { fieldHtml } = req.body;
    const ai = await callOpenRouter(`Classify whether this form field is required or optional.\nField: ${fieldHtml}\nForm: ${JSON.stringify(f)}\nRespond JSON: { "is_required": true|false, "evidence": [...], "confidence": "high|medium|low" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-validation-error', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Predict likely validation errors when submitting this form.\nForm: ${JSON.stringify(f)}\nFilled values: ${JSON.stringify(f.filled_values)}\nRespond JSON: { "predicted_errors": [{ "field": "...", "error": "...", "severity": "blocking|warning" }], "overall_risk": "low|medium|high" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-fill-order', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Recommend the optimal order to fill this form's fields.\nForm: ${JSON.stringify(f)}\nDetected fields: ${JSON.stringify(f.fields_detected)}\nRespond JSON: { "fill_order": [...], "rationale": "...", "grouped_steps": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET fill_order=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify(parsed.fill_order || []), f.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-captcha', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Detect if this form contains a CAPTCHA challenge.\nForm URL: ${f.form_url}\nOCR/context: ${JSON.stringify(f.fields_detected)}\nRespond JSON: { "captcha_detected": true|false, "captcha_type": "recaptcha|hcaptcha|image|text|none", "element_indicators": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET captcha_detected=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.captcha_detected, f.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-captcha-strategy', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Suggest a strategy to handle the CAPTCHA in this form.\nForm: ${JSON.stringify(f)}\nRespond JSON: { "strategy": "human-handoff|third-party-solver|wait|skip|other", "tools": [...], "estimated_delay_ms": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET captcha_strategy=$1, updated_at=NOW() WHERE id=$2`, [parsed.strategy || '', f.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-test-data', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Generate realistic test data for all fields in this form.\nForm: ${JSON.stringify(f)}\nFields: ${JSON.stringify(f.fields_detected)}\nRespond JSON: { "test_data": { "<field_name>": "<value>" }, "data_notes": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET test_data=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify(parsed.test_data || {}), f.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-form-complexity', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Score the complexity of this form for automation purposes.\nForm: ${JSON.stringify(f)}\nFields: ${JSON.stringify(f.fields_detected)}\nRespond JSON: { "complexity_score": 0-100, "complexity_factors": [...], "estimated_fill_time_ms": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET complexity_score=$1, updated_at=NOW() WHERE id=$2`, [parsed.complexity_score || null, f.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-cross-field-rules', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Validate cross-field dependency rules for this form.\nForm: ${JSON.stringify(f)}\nFilled values: ${JSON.stringify(f.filled_values)}\nRespond JSON: { "cross_field_valid": true|false, "violations": [{ "fields": [...], "rule": "...", "description": "..." }] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-multi-step-form', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Detect if this is a multi-step wizard form.\nForm URL: ${f.form_url}\nContext: ${JSON.stringify(f.fields_detected)}\nRespond JSON: { "is_multi_step": true|false, "step_indicators": [...], "estimated_steps": number, "navigation_type": "next-button|tab|url-change|modal" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET is_multi_step=$1, step_total=$2, updated_at=NOW() WHERE id=$3`, [!!parsed.is_multi_step, parsed.estimated_steps || 1, f.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-form-purpose', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Classify the purpose of this form.\nForm URL: ${f.form_url}\nFields: ${JSON.stringify(f.fields_detected)}\nRespond JSON: { "form_purpose": "login|signup|search|checkout|contact|survey|upload|filter|other", "confidence": "high|medium|low" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET form_purpose=$1, updated_at=NOW() WHERE id=$2`, [parsed.form_purpose || '', f.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-skip-field', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const { fieldName } = req.body;
    const ai = await callOpenRouter(`Recommend whether to skip this form field.\nField: ${fieldName}\nForm: ${JSON.stringify(f)}\nRespond JSON: { "should_skip": true|false, "reason": "...", "risk_of_skipping": "none|low|medium|high" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-form-fields', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Summarize all detected form fields and their requirements.\nForm: ${JSON.stringify(f)}\nFields: ${JSON.stringify(f.fields_detected)}\nRespond JSON: { "summary": "...", "required_count": number, "optional_count": number, "field_breakdown": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET ai_fill_notes=$1, updated_at=NOW() WHERE id=$2`, [parsed.summary || ai.result, f.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-submit-success', aiRateLimit, async (req, res) => {
  try {
    const f = await loadFill(req.body.fillId, res); if (!f) return;
    const ai = await callOpenRouter(`Predict the likelihood of successful form submission.\nForm: ${JSON.stringify(f)}\nFilled values: ${JSON.stringify(f.filled_values)}\nValidation errors: ${JSON.stringify(f.validation_errors)}\nRespond JSON: { "success_probability": 0-1, "blockers": [...], "recommendations": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
