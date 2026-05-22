/**
 * routes/cuaFeat_cuaPolicyGuard.js
 * CUA — Allow/Deny Lists, PII Redaction, Auditable Policy
 * 18 CRUD + 16 AI verbs  →  34 endpoints total
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../models/db');

const TABLE = 'cua_policy_guard';
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
    const where = req.query.decision ? `WHERE policy_decision=$1 AND archived=false` : `WHERE archived=false`;
    const params = req.query.decision ? [req.query.decision, limit, offset] : [limit, offset];
    const lp = req.query.decision ? '$2' : '$1';
    const op = req.query.decision ? '$3' : '$2';
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} ${where} ORDER BY created_at DESC LIMIT ${lp} OFFSET ${op}`, params);
    const { rows: cnt } = await pool.query(`SELECT COUNT(*) FROM ${TABLE} ${where}`, req.query.decision ? [req.query.decision] : []);
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
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false AND (action_type ILIKE $1 OR violation_type ILIKE $1 OR policy_name ILIKE $1) ORDER BY created_at DESC LIMIT 20`, [q]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. stats-summary
router.get('/stats/summary', async (req, res) => {
  try {
    const { rows: byDecision } = await pool.query(`SELECT policy_decision, COUNT(*) FROM ${TABLE} WHERE archived=false GROUP BY policy_decision`);
    const { rows: violations } = await pool.query(`SELECT COUNT(*) as violations FROM ${TABLE} WHERE archived=false AND policy_decision='deny'`);
    const { rows: piiCount } = await pool.query(`SELECT COUNT(*) as pii_detected FROM ${TABLE} WHERE archived=false AND pii_detected=true`);
    const { rows: avgRisk } = await pool.query(`SELECT AVG(risk_score) as avg_risk FROM ${TABLE} WHERE archived=false`);
    res.json({ byDecision, violationCount: parseInt(violations[0].violations), piiDetectedCount: parseInt(piiCount[0].pii_detected), avgRisk: avgRisk[0].avg_risk });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. export-csv (audit log)
router.get('/export/csv', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, session_id, action_type, policy_decision, violation_type, risk_score, pii_detected, policy_rule_id, policy_name, reviewed_at, reviewed_by, created_at FROM ${TABLE} WHERE archived=false ORDER BY created_at DESC`);
    if (!rows.length) return res.status(200).send('No data');
    const fields = Object.keys(rows[0]);
    const header = fields.join(',');
    const lines = rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="policy_guard_audit.csv"');
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

// 7. by-decision
router.get('/by-decision/:decision', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE policy_decision=$1 AND archived=false ORDER BY created_at DESC`, [req.params.decision]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, action_type, action_payload, policy_decision, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [item.session_id, item.action_type, JSON.stringify(item.action_payload || {}), item.policy_decision || 'allow', req.user?.id]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, action_type, policy_decision, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [obj.session_id, obj.action_type, obj.policy_decision || 'allow', req.user?.id]);
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
    const { session_id, action_type, action_payload, policy_decision = 'allow', policy_rule_id, policy_name } = req.body;
    const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, action_type, action_payload, policy_decision, policy_rule_id, policy_name, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [session_id, action_type, JSON.stringify(action_payload || {}), policy_decision, policy_rule_id, policy_name, req.user?.id]);
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

// 18. history (audit trail for a policy entry)
router.get('/:id/history', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    // Return full entry as audit trail + any related entries for same session
    const { rows: related } = await pool.query(`SELECT id, action_type, policy_decision, created_at FROM ${TABLE} WHERE session_id=$1 ORDER BY created_at DESC LIMIT 50`, [rows[0].session_id]);
    res.json({ data: rows[0], session_audit_trail: related });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── 16 AI verbs ─────────────────────────────────────────── */

async function loadEntry(id, res) {
  const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [id]);
  if (!rows.length) { res.status(404).json({ error: 'Policy entry not found' }); return null; }
  return rows[0];
}

router.post('/ai/classify-action-against-policy', aiRateLimit, async (req, res) => {
  try {
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const ai = await callOpenRouter(`Classify this automation action against the current CUA policy framework.\nEntry: ${JSON.stringify(e)}\nAction payload: ${JSON.stringify(e.action_payload)}\nRespond JSON: { "classification": "compliant|violation|grey-area", "policy_categories": [...], "confidence": "high|medium|low" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-policy-violation', aiRateLimit, async (req, res) => {
  try {
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const ai = await callOpenRouter(`Detect policy violations in this automation action.\nEntry: ${JSON.stringify(e)}\nAction: ${JSON.stringify(e.action_payload)}\nRespond JSON: { "violation_detected": true|false, "violation_type": "...", "severity": "low|medium|high|critical", "violated_rules": [...] }`);
    const parsed = parseAI(ai.result);
    if (parsed.violation_detected) {
      await pool.query(`UPDATE ${TABLE} SET violation_type=$1, policy_decision='deny', updated_at=NOW() WHERE id=$2`, [parsed.violation_type || '', e.id]);
    }
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-policy-rule', aiRateLimit, async (req, res) => {
  try {
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const ai = await callOpenRouter(`Suggest a new policy rule to cover this type of automation action.\nEntry: ${JSON.stringify(e)}\nRespond JSON: { "rule_name": "...", "rule_description": "...", "condition": "...", "action": "allow|deny|require-approval", "rationale": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-action-policy-risk', aiRateLimit, async (req, res) => {
  try {
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const ai = await callOpenRouter(`Score the policy risk of this automation action.\nEntry: ${JSON.stringify(e)}\nRespond JSON: { "risk_score": 0-100, "risk_tier": "low|medium|high|critical", "risk_categories": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET risk_score=$1, updated_at=NOW() WHERE id=$2`, [parsed.risk_score || null, e.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-allow-deny', aiRateLimit, async (req, res) => {
  try {
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const ai = await callOpenRouter(`Recommend whether to allow or deny this automation action.\nEntry: ${JSON.stringify(e)}\nAction: ${JSON.stringify(e.action_payload)}\nRespond JSON: { "decision": "allow|deny|allow-with-conditions", "conditions": [...], "rationale": "...", "confidence": "high|medium|low" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET policy_decision=$1, updated_at=NOW() WHERE id=$2`, [parsed.decision === 'deny' ? 'deny' : 'allow', e.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-policy-config', aiRateLimit, async (req, res) => {
  try {
    const { policyConfig } = req.body;
    const ai = await callOpenRouter(`Validate this CUA policy configuration for correctness and completeness.\nConfig: ${JSON.stringify(policyConfig)}\nRespond JSON: { "is_valid": true|false, "errors": [...], "warnings": [...], "suggestions": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-policy-explanation', aiRateLimit, async (req, res) => {
  try {
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const ai = await callOpenRouter(`Generate a plain-language explanation of why this policy decision was made.\nEntry: ${JSON.stringify(e)}\nDecision: ${e.policy_decision}\nRespond JSON: { "explanation": "...", "layperson_summary": "...", "technical_details": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET explanation=$1, updated_at=NOW() WHERE id=$2`, [parsed.explanation || ai.result, e.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-policy-events', aiRateLimit, async (req, res) => {
  try {
    const { sessionId, limit: lim = 50 } = req.body;
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE session_id=$1 AND archived=false ORDER BY created_at DESC LIMIT $2`, [sessionId, lim]);
    const ai = await callOpenRouter(`Summarize the policy events for this CUA session.\nEvents: ${JSON.stringify(rows)}\nRespond JSON: { "summary": "...", "allow_count": number, "deny_count": number, "high_risk_count": number, "notable_events": [...] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-policy-conflict', aiRateLimit, async (req, res) => {
  try {
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const { existingRules } = req.body;
    const ai = await callOpenRouter(`Predict whether this action or rule conflicts with existing policy rules.\nEntry: ${JSON.stringify(e)}\nExisting rules: ${JSON.stringify(existingRules || [])}\nRespond JSON: { "conflict_detected": true|false, "conflicting_rules": [...], "resolution_suggestion": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-pii-in-action', aiRateLimit, async (req, res) => {
  try {
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const ai = await callOpenRouter(`Classify any PII present in this automation action payload.\nAction payload: ${JSON.stringify(e.action_payload)}\nRespond JSON: { "pii_detected": true|false, "pii_types": [...], "pii_fields": [...], "sensitivity": "none|low|medium|high|critical" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET pii_detected=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.pii_detected, e.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/redact-action-payload', aiRateLimit, async (req, res) => {
  try {
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const ai = await callOpenRouter(`Redact all PII and sensitive data from this action payload.\nPayload: ${JSON.stringify(e.action_payload)}\nRespond JSON: { "redacted_payload": {}, "redacted_fields": [...], "redaction_count": number }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET pii_redacted_payload=$1, pii_detected=true, updated_at=NOW() WHERE id=$2`, [JSON.stringify(parsed.redacted_payload || {}), e.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-policy-tightening', aiRateLimit, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE session_id=$1 AND archived=false AND policy_decision='allow' ORDER BY risk_score DESC LIMIT 20`, [sessionId]);
    const ai = await callOpenRouter(`Suggest ways to tighten the CUA policy based on recent allowed actions.\nHigh-risk allowed actions: ${JSON.stringify(rows)}\nRespond JSON: { "suggestions": [{ "rule_name": "...", "tightening_action": "...", "risk_reduction": "..." }] }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-policy-drift', aiRateLimit, async (req, res) => {
  try {
    const { sessionId, baselinePeriodDays = 7 } = req.body;
    const { rows: recent } = await pool.query(`SELECT policy_decision, risk_score FROM ${TABLE} WHERE session_id=$1 AND archived=false AND created_at > NOW() - INTERVAL '1 day' ORDER BY created_at DESC`, [sessionId]);
    const { rows: baseline } = await pool.query(`SELECT policy_decision, risk_score FROM ${TABLE} WHERE session_id=$1 AND archived=false AND created_at BETWEEN NOW() - INTERVAL '${baselinePeriodDays} days' AND NOW() - INTERVAL '1 day' ORDER BY created_at DESC LIMIT 100`, [sessionId]);
    const ai = await callOpenRouter(`Detect drift in policy enforcement between the baseline and recent period.\nRecent (last 24h): ${JSON.stringify(recent)}\nBaseline (${baselinePeriodDays}d): ${JSON.stringify(baseline)}\nRespond JSON: { "drift_detected": true|false, "drift_direction": "tighter|looser|stable", "drift_indicators": [...] }`);
    const parsed = parseAI(ai.result);
    if (req.body.entryId) {
      await pool.query(`UPDATE ${TABLE} SET drift_detected=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.drift_detected, req.body.entryId]);
    }
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-audit-review', aiRateLimit, async (req, res) => {
  try {
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const ai = await callOpenRouter(`Recommend whether this policy entry should be flagged for human audit review.\nEntry: ${JSON.stringify(e)}\nRespond JSON: { "needs_review": true|false, "review_priority": "low|medium|high|urgent", "review_reason": "...", "reviewer_role": "security|compliance|operations" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-compliance-report', aiRateLimit, async (req, res) => {
  try {
    const { sessionId, period = '7 days' } = req.body;
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE session_id=$1 AND archived=false ORDER BY created_at DESC LIMIT 200`, [sessionId]);
    const ai = await callOpenRouter(`Generate a compliance report for this CUA session's policy events.\nPeriod: ${period}\nPolicy events: ${JSON.stringify(rows)}\nRespond JSON: { "report": "...", "compliance_score": 0-100, "violations_summary": [...], "recommendations": [...], "generated_at": "${new Date().toISOString()}" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-policy-coverage', aiRateLimit, async (req, res) => {
  try {
    const { policyRules } = req.body;
    const e = await loadEntry(req.body.entryId, res); if (!e) return;
    const ai = await callOpenRouter(`Score how well the current policy rules cover all automation action types.\nSample entry: ${JSON.stringify(e)}\nCurrent rules: ${JSON.stringify(policyRules || [])}\nRespond JSON: { "coverage_score": 0-100, "uncovered_action_types": [...], "coverage_gaps": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET coverage_score=$1, updated_at=NOW() WHERE id=$2`, [parsed.coverage_score || null, e.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
