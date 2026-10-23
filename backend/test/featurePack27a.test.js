const { test, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createFeaturePackRouter, FEATURES } = require('../routes/featurePack27a');

const records = [
  { id: 1, name: 'alpha-web', severity: 'critical', status: 'open', risk_score: 9, target_type: 'web', is_active: false, count: 0 },
  { id: 2, name: 'beta-api', severity: 'low', status: 'resolved', risk_score: 2, target_type: 'api', is_active: true, count: 3 },
];
let server; let base;
const auth = (req, res, next) => { if (!req.header('x-user')) return res.status(401).json({ error: 'Access denied' }); req.user = { id: req.header('x-user') }; return next(); };
before(async () => {
  const app = express(); app.use(express.json());
  app.use('/api/feature-pack', createFeaturePackRouter({ authenticate: auth, loadRecords: async () => records, env: {}, fetchImpl: async () => { throw new Error('provider must not be called without a key'); } }));
  await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}/api/feature-pack`;
});
after(() => server.close());
const call = (p, o = {}) => fetch(base + p, { ...o, headers: { 'Content-Type': 'application/json', 'x-user': 'u1', ...(o.headers || {}) } });

test('tasks require auth and support create/list/update with owner isolation', async () => {
  assert.equal((await fetch(base + '/tasks')).status, 401);
  const created = await (await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'Patch alpha' }) })).json();
  assert.equal(created.title, 'Patch alpha');
  assert.equal((await (await call('/tasks?search=patch')).json()).total, 1);
  assert.equal((await (await call('/tasks', { headers: { 'x-user': 'u2' } })).json()).total, 0);
  const updated = await (await call(`/tasks/${created.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) })).json();
  assert.equal(updated.status, 'done');
  assert.equal((await call(`/tasks/${created.id}`, { method: 'PATCH', headers: { 'x-user': 'u2' }, body: JSON.stringify({ status: 'x' }) })).status, 404);
  assert.equal((await call('/tasks', { method: 'POST', body: JSON.stringify({}) })).status, 400);
});

test('main records export as CSV and JSON with search filter, preserving 0/false', async () => {
  const csv = await (await call('/records/export?format=csv&search=alpha')).text();
  assert.match(csv, /alpha-web/); assert.match(csv, /false/); assert.match(csv, /,0/); assert.doesNotMatch(csv, /beta-api/);
  const json = await (await call('/records/export?format=json')).json();
  assert.equal(json.total, 2); assert.equal(json.data[0].count, 0); assert.equal(json.data[0].is_active, false);
  assert.equal((await call('/records/export?format=xml')).status, 400);
});

test('AI features return labelled deterministic fallback with aiGenerated:false and zero counts', async () => {
  assert.ok(FEATURES.length >= 2);
  for (const f of FEATURES) {
    const body = await (await call(`/ai/${f}`, { method: 'POST', body: JSON.stringify({ records }) })).json();
    assert.equal(body.aiGenerated, false, f); assert.equal(body.source, 'deterministic-fallback', f); assert.equal(body.result.totalRecords, 2, f);
  }
  const empty = await (await call(`/ai/${FEATURES[0]}`, { method: 'POST', body: JSON.stringify({ records: [] }) })).json();
  assert.equal(empty.result.totalRecords, 0);
  assert.equal((await call('/ai/nope', { method: 'POST', body: '{}' })).status, 404);
});
