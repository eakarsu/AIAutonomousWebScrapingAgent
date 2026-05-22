/**
 * routes/cuaFeat_sessionRecording.js
 * CUA — Record Actions, Replay, Edit, Export
 * 18 CRUD + 16 AI verbs  →  34 endpoints total
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../models/db');

const TABLE = 'cua_session_recordings';
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
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false AND (recording_name ILIKE $1 OR failure_cause ILIKE $1) ORDER BY created_at DESC LIMIT 20`, [q]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. stats-summary
router.get('/stats/summary', async (req, res) => {
  try {
    const { rows: byStatus } = await pool.query(`SELECT status, COUNT(*) FROM ${TABLE} WHERE archived=false GROUP BY status`);
    const { rows: driftCount } = await pool.query(`SELECT COUNT(*) as drifted FROM ${TABLE} WHERE archived=false AND drift_detected=true`);
    const { rows: avgComplete } = await pool.query(`SELECT AVG(completeness_score) as avg_completeness FROM ${TABLE} WHERE archived=false`);
    res.json({ byStatus, driftedCount: parseInt(driftCount[0].drifted), avgCompleteness: avgComplete[0].avg_completeness });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. export-csv
router.get('/export/csv', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, session_id, recording_name, duration_ms, action_count, completeness_score, status, drift_detected, created_at FROM ${TABLE} WHERE archived=false ORDER BY created_at DESC`);
    if (!rows.length) return res.status(200).send('No data');
    const fields = Object.keys(rows[0]);
    const header = fields.join(',');
    const lines = rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="session_recordings.csv"');
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, recording_name, status, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [item.session_id, item.recording_name || 'unnamed', item.status || 'recording', req.user?.id]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, recording_name, created_by) VALUES ($1,$2,$3) RETURNING *`, [obj.session_id, obj.recording_name, req.user?.id]);
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
    const { session_id, recording_name = 'unnamed', status = 'recording' } = req.body;
    const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, recording_name, status, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [session_id, recording_name, status, req.user?.id]);
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
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=true, status='archived', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. restore
router.post('/:id/restore', async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=false, status='completed', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. history
router.get('/:id/history', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0], actions: rows[0].actions || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── 16 AI verbs ─────────────────────────────────────────── */

async function loadRecording(id, res) {
  const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [id]);
  if (!rows.length) { res.status(404).json({ error: 'Recording not found' }); return null; }
  return rows[0];
}

router.post('/ai/summarize-session', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Summarize this automation session recording.\nRecording: ${JSON.stringify(r)}\nRespond JSON: { "summary": "...", "key_milestones": [...], "outcome": "success|partial|failed", "duration_readable": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-edit-cuts', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Suggest which actions to cut from this recording to create a cleaner replay.\nRecording: ${JSON.stringify(r)}\nActions: ${JSON.stringify(r.actions)}\nRespond JSON: { "cuts": [{ "action_index": number, "reason": "...", "safe_to_remove": true|false }], "optimized_action_count": number }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-action-significance', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const { actionIndex } = req.body;
    const action = (r.actions || [])[actionIndex];
    const ai = await callOpenRouter(`Classify the significance of this recorded action.\nAction: ${JSON.stringify(action)}\nRecording context: ${JSON.stringify(r)}\nRespond JSON: { "significance": "critical|important|routine|noise", "reason": "...", "keep_in_replay": true|false }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-sensitive-action', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Detect any sensitive actions in this recording (password entry, PII, payment).\nRecording: ${JSON.stringify(r)}\nActions: ${JSON.stringify(r.actions)}\nRespond JSON: { "sensitive_actions": [{ "index": number, "type": "...", "severity": "low|medium|high" }], "redaction_required": true|false }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET sensitive_actions=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify(parsed.sensitive_actions || []), r.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-replay-script', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Generate a deterministic replay script from this recording.\nRecording: ${JSON.stringify(r)}\nActions: ${JSON.stringify(r.actions)}\nRespond JSON: { "script": "...", "language": "javascript", "estimated_duration_ms": number, "notes": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET replay_script=$1, updated_at=NOW() WHERE id=$2`, [parsed.script || ai.result, r.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-replay-success', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Predict the success probability for replaying this recording.\nRecording: ${JSON.stringify(r)}\nRespond JSON: { "success_probability": 0-1, "risk_factors": [...], "flaky_steps": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-checkpoint', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Recommend checkpoint positions in this recording for safer replay.\nRecording: ${JSON.stringify(r)}\nActions: ${JSON.stringify(r.actions)}\nRespond JSON: { "checkpoints": [{ "after_action_index": number, "reason": "...", "state_snapshot_needed": true|false }] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET checkpoints=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify(parsed.checkpoints || []), r.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-recording-completeness', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Score the completeness of this session recording.\nRecording: ${JSON.stringify(r)}\nRespond JSON: { "completeness_score": 0-100, "missing_elements": [...], "improvement_suggestions": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET completeness_score=$1, updated_at=NOW() WHERE id=$2`, [parsed.completeness_score || null, r.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-action-determinism', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Validate whether the actions in this recording are deterministic and reproducible.\nRecording: ${JSON.stringify(r)}\nActions: ${JSON.stringify(r.actions)}\nRespond JSON: { "is_deterministic": true|false, "non_deterministic_actions": [...], "fixes": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-flaky-action', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Detect flaky (timing-sensitive, non-deterministic) actions in this recording.\nActions: ${JSON.stringify(r.actions)}\nRespond JSON: { "flaky_actions": [{ "index": number, "reason": "...", "flakiness_score": 0-1, "suggested_fix": "..." }] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET flaky_actions=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify(parsed.flaky_actions || []), r.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-assertion', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Suggest assertions to add to this recording for robust replay verification.\nRecording: ${JSON.stringify(r)}\nActions: ${JSON.stringify(r.actions)}\nRespond JSON: { "assertions": [{ "after_action_index": number, "assertion_type": "element-exists|text-match|url-match|state-check", "assertion_code": "..." }] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET assertions=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify(parsed.assertions || []), r.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-failure-cause', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Classify the root cause of failure for this recording.\nRecording: ${JSON.stringify(r)}\nFailure cause: ${r.failure_cause}\nRespond JSON: { "failure_category": "element-not-found|timeout|network|captcha|auth|logic-error|other", "root_cause": "...", "prevention": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET failure_cause=$1, updated_at=NOW() WHERE id=$2`, [parsed.root_cause || r.failure_cause, r.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-test-from-recording', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Generate an automated test script from this session recording.\nRecording: ${JSON.stringify(r)}\nActions: ${JSON.stringify(r.actions)}\nAssertions: ${JSON.stringify(r.assertions)}\nRespond JSON: { "test_script": "...", "framework": "playwright|puppeteer|selenium", "test_cases": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET test_script=$1, updated_at=NOW() WHERE id=$2`, [parsed.test_script || ai.result, r.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-coverage', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const ai = await callOpenRouter(`Summarize the automation coverage of this session recording.\nRecording: ${JSON.stringify(r)}\nRespond JSON: { "coverage_summary": "...", "pages_covered": [...], "interactions_covered": [...], "coverage_gaps": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET coverage_summary=$1, updated_at=NOW() WHERE id=$2`, [parsed.coverage_summary || ai.result, r.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-record-frequency', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const { workflowType } = req.body;
    const ai = await callOpenRouter(`Recommend how often this automation workflow should be recorded for monitoring.\nRecording: ${JSON.stringify(r)}\nWorkflow type: ${workflowType}\nRespond JSON: { "frequency": "every-run|daily|weekly|on-change|on-failure", "rationale": "...", "retention_days": number }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-recording-drift', aiRateLimit, async (req, res) => {
  try {
    const r = await loadRecording(req.body.recordingId, res); if (!r) return;
    const { baselineRecordingId } = req.body;
    let baseline = null;
    if (baselineRecordingId) {
      const { rows: br } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [baselineRecordingId]);
      baseline = br[0] || null;
    }
    const ai = await callOpenRouter(`Detect drift between this recording and its baseline (if provided).\nCurrent: ${JSON.stringify(r)}\nBaseline: ${JSON.stringify(baseline)}\nRespond JSON: { "drift_detected": true|false, "drift_score": 0-1, "changed_steps": [...], "new_steps": [...], "removed_steps": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET drift_detected=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.drift_detected, r.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
