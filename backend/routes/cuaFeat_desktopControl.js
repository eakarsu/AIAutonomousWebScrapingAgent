/**
 * routes/cuaFeat_desktopControl.js
 * CUA — Desktop Session Control
 * 18 CRUD + 16 AI verbs  →  34 endpoints total
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../models/db');

const TABLE = 'cua_desktop_sessions';
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
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content || '';
  return { result: content, model: j.model, usage: j.usage };
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
    const where = req.query.status ? `WHERE status=$1 AND archived=false` : `WHERE archived=false`;
    const params = req.query.status ? [req.query.status, limit, offset] : [limit, offset];
    const limitIdx = req.query.status ? '$2' : '$1';
    const offsetIdx = req.query.status ? '$3' : '$2';
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} ${where} ORDER BY created_at DESC LIMIT ${limitIdx} OFFSET ${offsetIdx}`, params);
    const { rows: cnt } = await pool.query(`SELECT COUNT(*) FROM ${TABLE} ${where}`, req.query.status ? [req.query.status] : []);
    res.json({ data: rows, pagination: { page, limit, total: parseInt(cnt[0].count), totalPages: Math.ceil(parseInt(cnt[0].count) / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. count
router.get('/count', async (req, res) => {
  try {
    const where = req.query.status ? `WHERE status=$1 AND archived=false` : `WHERE archived=false`;
    const params = req.query.status ? [req.query.status] : [];
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
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false AND (session_name ILIKE $1 OR target_app ILIKE $1 OR last_action ILIKE $1) ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. stats-summary
router.get('/stats/summary', async (req, res) => {
  try {
    const { rows: byStatus } = await pool.query(`SELECT status, COUNT(*) as count FROM ${TABLE} WHERE archived=false GROUP BY status`);
    const { rows: byPlatform } = await pool.query(`SELECT os_platform, COUNT(*) as count FROM ${TABLE} WHERE archived=false GROUP BY os_platform`);
    const { rows: avgRisk } = await pool.query(`SELECT AVG(ai_risk_score) as avg_risk FROM ${TABLE} WHERE archived=false`);
    res.json({ byStatus, byPlatform, avgRisk: avgRisk[0].avg_risk });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. export-csv
router.get('/export/csv', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false ORDER BY created_at DESC`);
    if (!rows.length) return res.status(200).send('No data');
    const fields = Object.keys(rows[0]);
    const header = fields.join(',');
    const lines = rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="desktop_sessions.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. by-session (alias: list sessions by created_by)
router.get('/by-session/:sessionId', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1 AND archived=false`, [req.params.sessionId]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. by-status
router.get('/by-status/:status', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE status=$1 AND archived=false ORDER BY created_at DESC`, [req.params.status]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_name, target_app, status, os_platform, resolution, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [item.session_name || 'unnamed', item.target_app, item.status || 'idle', item.os_platform, item.resolution, req.user?.id]);
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

// 10. batch-delete (soft)
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_name, target_app, os_platform, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [obj.session_name || 'imported', obj.target_app, obj.os_platform, req.user?.id]);
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
    const { session_name = 'unnamed', target_app, status = 'idle', os_platform, resolution, script_payload } = req.body;
    const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_name, target_app, status, os_platform, resolution, script_payload, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [session_name, target_app, status, os_platform, resolution, script_payload, req.user?.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 14. update
router.put('/:id', async (req, res) => {
  try {
    const fields = req.body;
    const keys = Object.keys(fields);
    if (!keys.length) return res.status(400).json({ error: 'No fields to update' });
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
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=true, status='idle', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. restore
router.post('/:id/restore', async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=false, status='idle', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. history
router.get('/:id/history', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0], action_log: rows[0].action_log || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── 16 AI verbs ─────────────────────────────────────────── */

async function loadSession(id, res) {
  const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [id]);
  if (!rows.length) { res.status(404).json({ error: 'Session not found' }); return null; }
  return rows[0];
}

router.post('/ai/classify-screen-state', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Classify the current screen state for this desktop automation session.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "screen_state": "...", "app_detected": "...", "confidence": "high|medium|low", "details": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-next-action', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Given this desktop session state, suggest the next best automation action.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "action_type": "click|type|scroll|wait|key", "target": "...", "value": "...", "rationale": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-action-success', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Predict the success probability for the last recorded action in this session.\nSession: ${JSON.stringify(s)}\nLast action: ${s.last_action}\nRespond JSON: { "success_probability": 0-1, "risk_factors": [...], "recommendation": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-blocker', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Detect any blockers preventing automation progress for this session.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "blocker_detected": true|false, "blocker_type": "...", "description": "...", "suggested_resolution": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-action-risk', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const { action } = req.body;
    const ai = await callOpenRouter(`Score the risk of performing this action in the current session.\nSession: ${JSON.stringify(s)}\nProposed action: ${JSON.stringify(action)}\nRespond JSON: { "risk_score": 0-100, "risk_tier": "low|medium|high|critical", "risk_factors": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-fallback-action', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Recommend a fallback action when the primary action fails.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "fallback_action": "...", "steps": [...], "rationale": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-action-script', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Generate a reusable automation script for this desktop session task.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "script_language": "javascript", "script": "...", "description": "...", "estimated_steps": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET script_payload=$1, updated_at=NOW() WHERE id=$2`, [typeof parsed.script === 'string' ? parsed.script : ai.result, s.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-session', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Summarize what happened in this desktop automation session.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "summary": "...", "actions_taken": [...], "outcome": "...", "issues": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-action-feasibility', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const { action } = req.body;
    const ai = await callOpenRouter(`Validate whether this action is feasible in the current desktop session context.\nSession: ${JSON.stringify(s)}\nAction: ${JSON.stringify(action)}\nRespond JSON: { "feasible": true|false, "blockers": [...], "prerequisites": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-popup', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Detect any popup dialogs that may be interrupting automation in this session.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "popup_detected": true|false, "popup_type": "alert|confirm|modal|notification|other", "suggested_handler": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-app-window', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Classify the type of application window visible in this automation session.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "window_class": "browser|desktop_app|terminal|dialog|file_picker|other", "app_name": "...", "confidence": "high|medium|low" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-keyboard-shortcut', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const { intent } = req.body;
    const ai = await callOpenRouter(`Suggest the best keyboard shortcut for this intent in the current application.\nSession: ${JSON.stringify(s)}\nIntent: ${intent}\nOS: ${s.os_platform}\nRespond JSON: { "shortcut": "...", "description": "...", "alternative_shortcuts": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-load-time', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Predict the expected load/response time for the next action in this session.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "estimated_ms": number, "confidence": "high|medium|low", "factors": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-wait-strategy', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Recommend the optimal wait strategy for this automation step.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "strategy": "fixed|polling|network-idle|element-visible|custom", "wait_ms": number, "condition": "...", "rationale": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-error-dialog', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Detect error dialogs or error states in the current automation session.\nSession: ${JSON.stringify(s)}\nRespond JSON: { "error_detected": true|false, "error_type": "...", "error_message": "...", "is_recoverable": true|false }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-recovery-plan', aiRateLimit, async (req, res) => {
  try {
    const s = await loadSession(req.body.sessionId, res); if (!s) return;
    const ai = await callOpenRouter(`Generate a step-by-step recovery plan for this failed automation session.\nSession: ${JSON.stringify(s)}\nError state: ${s.error_state}\nRespond JSON: { "recovery_steps": [...], "estimated_recovery_time": "...", "requires_human": true|false, "prevention_tips": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET recovery_plan=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify(parsed), s.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
