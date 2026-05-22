/**
 * routes/cuaFeat_humanHandoff.js
 * CUA — Escalation Queue, Human Takeover, Return-to-Bot
 * 18 CRUD + 16 AI verbs  →  34 endpoints total
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../models/db');

const TABLE = 'cua_human_handoffs';
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
    const where = req.query.status ? `WHERE status=$1 AND archived=false` : `WHERE archived=false`;
    const params = req.query.status ? [req.query.status, limit, offset] : [limit, offset];
    const limitParam = req.query.status ? '$2' : '$1';
    const offsetParam = req.query.status ? '$3' : '$2';
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} ${where} ORDER BY urgency_score DESC, created_at DESC LIMIT ${limitParam} OFFSET ${offsetParam}`, params);
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
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false AND (handoff_reason ILIKE $1 OR assigned_to ILIKE $1 OR handoff_summary ILIKE $1) ORDER BY urgency_score DESC LIMIT 20`, [q]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. stats-summary
router.get('/stats/summary', async (req, res) => {
  try {
    const { rows: byStatus } = await pool.query(`SELECT status, COUNT(*) FROM ${TABLE} WHERE archived=false GROUP BY status`);
    const { rows: avgUrgency } = await pool.query(`SELECT AVG(urgency_score) as avg_urgency FROM ${TABLE} WHERE archived=false`);
    const { rows: lowValue } = await pool.query(`SELECT COUNT(*) as low_value_count FROM ${TABLE} WHERE archived=false AND is_low_value=true`);
    res.json({ byStatus, avgUrgency: avgUrgency[0].avg_urgency, lowValueCount: parseInt(lowValue[0].low_value_count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. export-csv
router.get('/export/csv', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, session_id, handoff_reason, urgency_score, status, assigned_to, return_to_bot_ready, quality_score, is_low_value, created_at FROM ${TABLE} WHERE archived=false ORDER BY created_at DESC`);
    if (!rows.length) return res.status(200).send('No data');
    const fields = Object.keys(rows[0]);
    const header = fields.join(',');
    const lines = rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="human_handoffs.csv"');
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

// 7. by-assignee
router.get('/by-assignee/:assignee', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE assigned_to=$1 AND archived=false ORDER BY urgency_score DESC`, [req.params.assignee]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, handoff_reason, urgency_score, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [item.session_id, item.handoff_reason, item.urgency_score || 50, req.user?.id]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, handoff_reason, created_by) VALUES ($1,$2,$3) RETURNING *`, [obj.session_id, obj.handoff_reason, req.user?.id]);
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
    const { session_id, recording_id, handoff_reason, urgency_score = 50, assigned_to, context_payload } = req.body;
    const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, recording_id, handoff_reason, urgency_score, assigned_to, context_payload, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [session_id, recording_id, handoff_reason, urgency_score, assigned_to, JSON.stringify(context_payload || {}), req.user?.id]);
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
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=true, status='closed', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. restore
router.post('/:id/restore', async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=false, status='queued', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. history
router.get('/:id/history', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0], humanActions: rows[0].human_actions || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── 16 AI verbs ─────────────────────────────────────────── */

async function loadHandoff(id, res) {
  const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [id]);
  if (!rows.length) { res.status(404).json({ error: 'Handoff not found' }); return null; }
  return rows[0];
}

router.post('/ai/classify-handoff-reason', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Classify the primary reason this automation session was handed off to a human.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "category": "captcha|auth-failure|unexpected-state|policy|data-validation|timeout|other", "sub_reason": "...", "confidence": "high|medium|low" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-handoff-need', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Predict whether this automation session is likely to need a human handoff.\nSession context: ${JSON.stringify(h)}\nRespond JSON: { "handoff_likely": true|false, "probability": 0-1, "triggers": [...], "recommended_preemptive_action": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-context-to-pass', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Suggest what context information to pass to the human agent for this handoff.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "context_items": [{ "key": "...", "value": "...", "priority": "critical|important|nice-to-have" }], "suggested_format": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-handoff-summary', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Generate a clear handoff summary for the human agent taking over this automation session.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "summary": "...", "current_state": "...", "next_steps": [...], "warnings": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET handoff_summary=$1, updated_at=NOW() WHERE id=$2`, [parsed.summary || ai.result, h.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-handoff-urgency', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Score the urgency of this human handoff request.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "urgency_score": 0-100, "urgency_tier": "low|medium|high|critical", "time_sensitive_reason": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET urgency_score=$1, updated_at=NOW() WHERE id=$2`, [parsed.urgency_score || h.urgency_score, h.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-assignee', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const { availableAgents } = req.body;
    const ai = await callOpenRouter(`Recommend the best human agent to assign this handoff to.\nHandoff: ${JSON.stringify(h)}\nAvailable agents: ${JSON.stringify(availableAgents || [])}\nRespond JSON: { "recommended_assignee": "...", "reason": "...", "alternatives": [...] }`);
    const parsed = parseAI(ai.result);
    if (parsed.recommended_assignee) {
      await pool.query(`UPDATE ${TABLE} SET assigned_to=$1, updated_at=NOW() WHERE id=$2`, [parsed.recommended_assignee, h.id]);
    }
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-cycle', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const { recentHandoffs } = req.body;
    const ai = await callOpenRouter(`Detect if this handoff is part of a repetitive cycle that indicates a deeper problem.\nCurrent handoff: ${JSON.stringify(h)}\nRecent handoffs: ${JSON.stringify(recentHandoffs || [])}\nRespond JSON: { "cycle_detected": true|false, "cycle_type": "...", "root_cause": "...", "recommended_fix": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-handoff-completeness', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Validate that this handoff record contains all necessary information for the human agent.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "is_complete": true|false, "missing_fields": [...], "completeness_score": 0-100 }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-human-actions', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Summarize the actions taken by the human agent during this handoff.\nHandoff: ${JSON.stringify(h)}\nHuman actions: ${JSON.stringify(h.human_actions)}\nRespond JSON: { "summary": "...", "resolution_type": "resolved|escalated|deferred|failed", "key_actions": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-return-to-bot-readiness', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Assess whether the automation bot can safely resume control after this handoff.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "ready_for_return": true|false, "prerequisites": [...], "confidence": "high|medium|low", "estimated_resume_delay_ms": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET return_to_bot_ready=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.ready_for_return, h.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-resolution-time', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Predict how long this human handoff will take to resolve.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "estimated_minutes": number, "confidence": "high|medium|low", "factors": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET predicted_resolve=$1, updated_at=NOW() WHERE id=$2`, [parsed.estimated_minutes ? parsed.estimated_minutes * 60000 : null, h.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-training-data', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Recommend training data to extract from this handoff to improve the bot.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "training_examples": [{ "input": "...", "expected_output": "...", "label": "..." }], "improvement_area": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-coach-feedback', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Generate coaching feedback for the human agent based on this handoff performance.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "feedback": "...", "strengths": [...], "improvement_areas": [...], "coaching_score": 0-100 }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET coach_feedback=$1, updated_at=NOW() WHERE id=$2`, [parsed.feedback || ai.result, h.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-handoff-quality', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Score the quality of this handoff process end-to-end.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "quality_score": 0-100, "criteria": [{ "criterion": "...", "score": 0-100, "notes": "..." }] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET quality_score=$1, updated_at=NOW() WHERE id=$2`, [parsed.quality_score || null, h.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-low-value-handoff', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Determine if this handoff was low-value and could have been handled autonomously.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "is_low_value": true|false, "reason": "...", "automation_feasibility": "possible|partial|not-possible", "suggested_automation": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET is_low_value=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.is_low_value, h.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-handoff-prevention', aiRateLimit, async (req, res) => {
  try {
    const h = await loadHandoff(req.body.handoffId, res); if (!h) return;
    const ai = await callOpenRouter(`Suggest improvements to prevent this type of handoff from happening in the future.\nHandoff: ${JSON.stringify(h)}\nRespond JSON: { "prevention_strategies": [...], "automation_improvements": [...], "estimated_reduction_percent": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET prevention_hint=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify(parsed.prevention_strategies || []), h.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
