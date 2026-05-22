/**
 * routes/cuaFeat_multiTabOrchestration.js
 * CUA — Multi-Tab/Window Context Isolation & Focus Management
 * 18 CRUD + 16 AI verbs  →  34 endpoints total
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../models/db');

const TABLE = 'cua_tab_orchestrations';
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
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE archived=false AND (tab_url ILIKE $1 OR tab_title ILIKE $1 OR tab_purpose ILIKE $1) ORDER BY created_at DESC LIMIT 20`, [q]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. stats-summary
router.get('/stats/summary', async (req, res) => {
  try {
    const { rows: byPurpose } = await pool.query(`SELECT tab_purpose, COUNT(*) FROM ${TABLE} WHERE archived=false GROUP BY tab_purpose`);
    const { rows: focused } = await pool.query(`SELECT COUNT(*) as focused FROM ${TABLE} WHERE archived=false AND is_focused=true`);
    const { rows: leaks } = await pool.query(`SELECT COUNT(*) as leaked FROM ${TABLE} WHERE archived=false AND is_leaked=true`);
    res.json({ byPurpose, focusedCount: parseInt(focused[0].focused), leakCount: parseInt(leaks[0].leaked) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. export-csv
router.get('/export/csv', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, session_id, tab_id, tab_url, tab_title, tab_purpose, is_focused, relevance_score, health_score FROM ${TABLE} WHERE archived=false ORDER BY created_at DESC`);
    if (!rows.length) return res.status(200).send('No data');
    const fields = Object.keys(rows[0]);
    const header = fields.join(',');
    const lines = rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tab_orchestrations.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. by-session
router.get('/by-session/:sessionId', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE session_id=$1 AND archived=false ORDER BY priority_rank ASC, created_at DESC`, [req.params.sessionId]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. by-group
router.get('/by-group/:group', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE tab_group=$1 AND archived=false ORDER BY priority_rank ASC`, [req.params.group]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, tab_id, tab_url, tab_title, tab_purpose, tab_group, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [item.session_id, item.tab_id, item.tab_url, item.tab_title, item.tab_purpose, item.tab_group, req.user?.id]);
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
      const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, tab_url, tab_title, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [obj.session_id, obj.tab_url, obj.tab_title, req.user?.id]);
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
    const { session_id, tab_id, window_id, tab_url, tab_title, tab_purpose, tab_group } = req.body;
    const { rows } = await pool.query(`INSERT INTO ${TABLE} (session_id, tab_id, window_id, tab_url, tab_title, tab_purpose, tab_group, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [session_id, tab_id, window_id, tab_url, tab_title, tab_purpose, tab_group, req.user?.id]);
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
    const { rows } = await pool.query(`UPDATE ${TABLE} SET archived=true, is_focused=false, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
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

async function loadTab(id, res) {
  const { rows } = await pool.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [id]);
  if (!rows.length) { res.status(404).json({ error: 'Tab record not found' }); return null; }
  return rows[0];
}

router.post('/ai/classify-tab-purpose', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const ai = await callOpenRouter(`Classify the purpose of this browser tab in the automation workflow.\nTab: ${JSON.stringify(t)}\nRespond JSON: { "purpose": "data-collection|login|checkout|navigation|support|admin|other", "confidence": "high|medium|low" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET tab_purpose=$1, updated_at=NOW() WHERE id=$2`, [parsed.purpose || '', t.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-tab-grouping', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const { allTabs } = req.body;
    const ai = await callOpenRouter(`Suggest how to group this tab with other open tabs for better orchestration.\nThis tab: ${JSON.stringify(t)}\nOther tabs: ${JSON.stringify(allTabs || [])}\nRespond JSON: { "suggested_group": "...", "group_rationale": "...", "related_tab_ids": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET tab_group=$1, updated_at=NOW() WHERE id=$2`, [parsed.suggested_group || '', t.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-tab-load', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const ai = await callOpenRouter(`Predict the load time for this tab based on its URL and context.\nTab: ${JSON.stringify(t)}\nRespond JSON: { "estimated_load_ms": number, "confidence": "high|medium|low", "factors": [...] }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET load_predicted=$1, updated_at=NOW() WHERE id=$2`, [parsed.estimated_load_ms || null, t.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-tab-leak', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const ai = await callOpenRouter(`Detect if this tab represents a resource or context leak in the automation session.\nTab: ${JSON.stringify(t)}\nRespond JSON: { "is_leaked": true|false, "leak_type": "orphan|duplicate|zombie|stale|other", "recommended_action": "close|keep|investigate" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET is_leaked=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.is_leaked, t.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-tab-close', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const ai = await callOpenRouter(`Recommend whether this tab should be closed to free resources.\nTab: ${JSON.stringify(t)}\nRespond JSON: { "should_close": true|false, "reason": "...", "safe_to_close": true|false, "data_loss_risk": "none|low|high" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-tab-relevance', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const { workflowGoal } = req.body;
    const ai = await callOpenRouter(`Score the relevance of this tab to the current automation workflow goal.\nTab: ${JSON.stringify(t)}\nWorkflow goal: ${workflowGoal}\nRespond JSON: { "relevance_score": 0-1, "relevance_reasons": [...], "keep_open": true|false }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET relevance_score=$1, updated_at=NOW() WHERE id=$2`, [parsed.relevance_score || null, t.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-tab-summary', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const ai = await callOpenRouter(`Generate a concise summary of this tab's content and role in the automation.\nTab: ${JSON.stringify(t)}\nRespond JSON: { "summary": "...", "key_data": [...], "automation_role": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET ai_tab_summary=$1, updated_at=NOW() WHERE id=$2`, [parsed.summary || ai.result, t.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-tab-context-isolation', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const ai = await callOpenRouter(`Validate that this tab's context is properly isolated from other tabs.\nTab: ${JSON.stringify(t)}\nRespond JSON: { "is_isolated": true|false, "isolation_gaps": [...], "risk_level": "none|low|medium|high" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET context_isolated=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.is_isolated, t.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-tab-deadlock', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const ai = await callOpenRouter(`Detect if this tab is in a deadlock state that would block automation progress.\nTab: ${JSON.stringify(t)}\nRespond JSON: { "deadlock_detected": true|false, "deadlock_type": "...", "resolution": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET deadlock_risk=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.deadlock_detected, t.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-window-vs-tab', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const ai = await callOpenRouter(`Classify whether this context is a browser tab or a standalone window.\nContext: ${JSON.stringify(t)}\nRespond JSON: { "is_window": true|false, "type": "tab|popup-window|main-window|iframe-context", "handling_notes": "..." }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET is_window=$1, updated_at=NOW() WHERE id=$2`, [!!parsed.is_window, t.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-focus-loss', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const ai = await callOpenRouter(`Predict the risk of focus being lost from this tab during automation.\nTab: ${JSON.stringify(t)}\nRespond JSON: { "focus_loss_risk": 0-1, "triggers": [...], "mitigation": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-context-switch', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const { currentTabId, allTabs } = req.body;
    const ai = await callOpenRouter(`Suggest the best tab to switch context to from the current tab.\nCurrent tab: ${currentTabId}\nAll tabs: ${JSON.stringify(allTabs || [])}\nTarget tab: ${JSON.stringify(t)}\nRespond JSON: { "switch_to_tab_id": "...", "reason": "...", "timing": "immediate|after-load|after-event" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-tab-state', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const ai = await callOpenRouter(`Provide a comprehensive state summary of this tab for orchestration decisions.\nTab: ${JSON.stringify(t)}\nRespond JSON: { "state_summary": "...", "health": "healthy|degraded|dead", "data_loaded": true|false, "ready_for_action": true|false }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-priority-tab', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const { allTabs } = req.body;
    const ai = await callOpenRouter(`Recommend which tab should receive priority focus in the current automation state.\nTabs: ${JSON.stringify(allTabs || [t])}\nWorkflow context: ${JSON.stringify(t)}\nRespond JSON: { "priority_tab_id": "...", "rank_order": [...], "rationale": "..." }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-cross-tab-data-leak', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const { otherTabContexts } = req.body;
    const ai = await callOpenRouter(`Detect if sensitive data from this tab is leaking to other tabs.\nTab: ${JSON.stringify(t)}\nOther tab contexts: ${JSON.stringify(otherTabContexts || [])}\nRespond JSON: { "leak_detected": true|false, "leaked_data_types": [...], "affected_tabs": [...], "severity": "low|medium|high|critical" }`);
    res.json({ success: true, result: parseAI(ai.result), model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-orchestration-health', aiRateLimit, async (req, res) => {
  try {
    const t = await loadTab(req.body.tabId, res); if (!t) return;
    const { allTabs } = req.body;
    const ai = await callOpenRouter(`Score the overall health of the multi-tab orchestration.\nAll tabs: ${JSON.stringify(allTabs || [t])}\nRespond JSON: { "health_score": 0-100, "issues": [...], "optimizations": [...], "overall_status": "healthy|degraded|critical" }`);
    const parsed = parseAI(ai.result);
    await pool.query(`UPDATE ${TABLE} SET health_score=$1, updated_at=NOW() WHERE id=$2`, [parsed.health_score || null, t.id]);
    res.json({ success: true, result: parsed, model: ai.model });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
