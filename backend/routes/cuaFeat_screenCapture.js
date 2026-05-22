/**
 * routes/cuaFeat_screenCapture.js
 * CUA — Periodic Screenshots, OCR, Diff Detection
 * 18 CRUD + 16 AI verbs  →  34 endpoints total
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../models/db');

const TABLE = 'cua_screen_captures';
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
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false ORDER BY captured_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false AND (ocr_text ILIKE $1 OR content_class ILIKE $1) ORDER BY captured_at DESC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. stats-summary
router.get('/stats/summary', async (req, res) => {
  try {
    const { rows: byStorage } = await pool.query(`SELECT storage_tier, COUNT(*) FROM ${TABLE} WHERE archived=false GROUP BY storage_tier`);
    const { rows: changes } = await pool.query(`SELECT COUNT(*) as with_changes FROM ${TABLE} WHERE archived=false AND change_detected=true`);
    const { rows: pii } = await pool.query(`SELECT COUNT(*) as pii_count FROM ${TABLE} WHERE archived=false AND pii_detected=true`);
    res.json({ byStorage, withChanges: parseInt(changes[0].with_changes), piiCount: parseInt(pii[0].pii_count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. export-csv
router.get('/export/csv', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, session_id, capture_url, width, height, captured_at, ocr_text, diff_score, change_detected, content_class, quality_score, storage_tier FROM ${TABLE} WHERE archived=false ORDER BY captured_at DESC`);
    if (!rows.length) return res.status(200).send('No data');
    const fields = Object.keys(rows[0]);
    const header = fields.join(',');
    const lines = rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="screen_captures.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. by-session
router.get('/by-session/:sessionId', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE session_id=$1 AND archived=false ORDER BY captured_at DESC LIMIT $2 OFFSET $3`, [req.params.sessionId, limit, offset]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. by-storage-tier
router.get('/by-storage/:tier', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE storage_tier=$1 AND archived=false ORDER BY captured_at DESC`, [req.params.tier]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, capture_url, width, height, storage_tier, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [item.session_id, item.capture_url, item.width, item.height, item.storage_tier || 'hot', req.user?.id]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, capture_url, created_by) VALUES ($1,$2,$3) RETURNING *`, [obj.session_id, obj.capture_url, req.user?.id]);
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
    const { session_id, capture_url, thumbnail_url, width, height, file_size_bytes, storage_tier = 'hot' } = req.body;
    const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, capture_url, thumbnail_url, width, height, file_size_bytes, storage_tier, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [session_id, capture_url, thumbnail_url, width, height, file_size_bytes, storage_tier, req.user?.id]);
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
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=true, storage_tier='cold', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. restore
router.post('/:id/restore', async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=false, storage_tier='hot', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
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

async function loadCapture(id, res) {
  const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [id]);
  if (!rows.length) { res.status(404).json({ error: 'Capture not found' }); return null; }
  return rows[0];
}

router.post('/ai/ocr-extract', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const ai = await callOpenRouter(`Perform OCR extraction on this screen capture record.\nCapture: ${JSON.stringify(c)}\nCapture URL: ${c.capture_url}\nRespond JSON: { "extracted_text": "...", "text_regions": [...], "language": "...", "confidence": "high|medium|low" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET ocr_text=$1, updated_at=NOW() WHERE id=$2`, [parsed.extracted_text || ai.result, c.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-change', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const { previousText } = req.body;
    const ai = await callOpenRouter(`Compare this capture's OCR text with the previous capture to detect meaningful changes.\nCurrent OCR: ${c.ocr_text}\nPrevious OCR: ${previousText || 'none'}\nRespond JSON: { "change_detected": true|false, "diff_score": 0-1, "changed_regions": [...], "change_significance": "low|medium|high" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET change_detected=$1, diff_score=$2, updated_at=NOW() WHERE id=$3`, [!!parsed.change_detected, parsed.diff_score || 0, c.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-screen-content', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const ai = await callOpenRouter(`Classify the content type of this screen capture.\nOCR Text: ${c.ocr_text || 'not available'}\nCapture: ${JSON.stringify(c)}\nRespond JSON: { "content_class": "...", "ui_type": "...", "app_context": "...", "confidence": "high|medium|low" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET content_class=$1, updated_at=NOW() WHERE id=$2`, [parsed.content_class || '', c.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-screen', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const ai = await callOpenRouter(`Summarize what is visible on this screen capture in plain language.\nOCR: ${c.ocr_text || 'n/a'}\nContent class: ${c.content_class}\nRespond JSON: { "summary": "...", "key_elements": [...], "user_state": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/redact-pii', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const ai = await callOpenRouter(`Identify and redact PII from this screen capture's extracted text.\nOCR text: ${c.ocr_text || 'none'}\nRespond JSON: { "redacted_text": "...", "pii_types_found": [...], "redaction_count": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET pii_redacted=true, updated_at=NOW() WHERE id=$1`, [c.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-screenshot-quality', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const ai = await callOpenRouter(`Score the quality of this screenshot for automation use.\nCapture: ${JSON.stringify(c)}\nRespond JSON: { "quality_score": 0-100, "issues": [...], "recommendations": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET quality_score=$1, updated_at=NOW() WHERE id=$2`, [parsed.quality_score || null, c.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-sensitive-data', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const ai = await callOpenRouter(`Detect any sensitive data visible in this screenshot.\nOCR: ${c.ocr_text || 'none'}\nRespond JSON: { "sensitive_data_found": true|false, "data_types": [...], "severity": "low|medium|high|critical", "recommended_action": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-region-of-interest', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const { goal } = req.body;
    const ai = await callOpenRouter(`Suggest the region of interest for the automation goal in this screenshot.\nGoal: ${goal}\nCapture: ${JSON.stringify(c)}\nRespond JSON: { "region": { "x": number, "y": number, "width": number, "height": number }, "rationale": "...", "priority": "high|medium|low" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET region_of_interest=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify(parsed.region || {}), c.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-alt-text', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const ai = await callOpenRouter(`Generate descriptive alt text for this screenshot for accessibility and logging.\nOCR: ${c.ocr_text || 'n/a'}\nContent class: ${c.content_class}\nRespond JSON: { "alt_text": "...", "short_description": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET ai_alt_text=$1, updated_at=NOW() WHERE id=$2`, [parsed.alt_text || ai.result, c.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-ui-element', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const { elementDescription } = req.body;
    const ai = await callOpenRouter(`Classify this UI element based on the screenshot context.\nElement: ${elementDescription}\nOCR: ${c.ocr_text || 'n/a'}\nRespond JSON: { "element_type": "button|input|dropdown|link|image|table|modal|other", "interactive": true|false, "state": "enabled|disabled|loading|hidden" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-content-region', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const { contentType } = req.body;
    const ai = await callOpenRouter(`Predict the bounding region of this content type in the screenshot.\nContent type to find: ${contentType}\nCapture dimensions: ${c.width}x${c.height}\nOCR: ${c.ocr_text || 'n/a'}\nRespond JSON: { "predicted_region": { "x": number, "y": number, "width": number, "height": number }, "confidence": "high|medium|low" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-capture-timing', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const ai = await callOpenRouter(`Validate whether this screenshot was captured at the right moment in the automation flow.\nCapture: ${JSON.stringify(c)}\nRespond JSON: { "timing_valid": true|false, "issues": [...], "recommended_capture_trigger": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-loading-state', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const ai = await callOpenRouter(`Detect if the page/app is in a loading state in this screenshot.\nOCR: ${c.ocr_text || 'n/a'}\nCapture: ${JSON.stringify(c)}\nRespond JSON: { "is_loading": true|false, "loading_type": "spinner|skeleton|progress|network|none", "estimated_wait_ms": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET loading_state=$1, updated_at=NOW() WHERE id=$2`, [parsed.loading_type || 'none', c.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-capture-cadence', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const { workflowType } = req.body;
    const ai = await callOpenRouter(`Recommend the optimal screenshot capture cadence for this workflow.\nWorkflow type: ${workflowType}\nRecent capture: ${JSON.stringify(c)}\nRespond JSON: { "interval_ms": number, "trigger_type": "time|event|change", "rationale": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-diff', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const { previousOcr } = req.body;
    const ai = await callOpenRouter(`Summarize the differences between this and the previous screen capture.\nCurrent: ${c.ocr_text || 'none'}\nPrevious: ${previousOcr || 'none'}\nDiff score: ${c.diff_score}\nRespond JSON: { "diff_summary": "...", "added_elements": [...], "removed_elements": [...], "changed_elements": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-storage-tier', aiRateLimit, async (req, res) => {
  try {
    const c = await loadCapture(req.body.captureId, res); if (!c) return;
    const ai = await callOpenRouter(`Recommend the appropriate storage tier for this screenshot based on its content and age.\nCapture: ${JSON.stringify(c)}\nRespond JSON: { "recommended_tier": "hot|warm|cold|delete", "rationale": "...", "retention_days": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET storage_tier=$1, updated_at=NOW() WHERE id=$2`, [parsed.recommended_tier || c.storage_tier, c.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
