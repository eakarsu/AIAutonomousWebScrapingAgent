/**
 * Custom Scraper Views — 4 endpoints
 *   GET  /api/custom-views/timeline        (VIZ) per-job last_run timeline
 *   GET  /api/custom-views/success-rate    (VIZ) per-domain success-rate chart
 *   GET  /api/custom-views/export-csv      (NON-VIZ) scraped-data CSV download
 *   GET  /api/custom-views/rules           (NON-VIZ) list scrape rules
 *   POST /api/custom-views/rules           (NON-VIZ) create scrape rule (selector)
 *   PUT  /api/custom-views/rules/:id       (NON-VIZ) update scrape rule
 *   DELETE /api/custom-views/rules/:id     (NON-VIZ) delete scrape rule
 *
 * All endpoints rely on the global auth + generalLimiter applied via server.js mount.
 */
const express = require('express');
const router = express.Router();
const pool = require('../models/db');

const safeNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const extractDomain = (url) => {
  if (!url || typeof url !== 'string') return 'unknown';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    const m = url.match(/https?:\/\/([^\/]+)/i);
    return m ? m[1].replace(/^www\./, '') : 'unknown';
  }
};

// ── 1) VIZ: Scrape Job Timeline ──────────────────────────────────────
router.get('/timeline', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, url, status, last_run, total_runs, data_collected, error_count
       FROM scraping_jobs
       ORDER BY last_run DESC NULLS LAST
       LIMIT 30`
    );
    const now = Date.now();
    const events = r.rows.map((j, i) => {
      const lr = j.last_run ? new Date(j.last_run).getTime() : now - i * 3600 * 1000;
      const hoursAgo = Math.max(0, Math.round((now - lr) / 3600000));
      return {
        id: j.id,
        name: j.name,
        domain: extractDomain(j.url),
        status: j.status,
        last_run: j.last_run,
        hours_ago: hoursAgo,
        total_runs: safeNum(j.total_runs),
        data_collected: safeNum(j.data_collected),
        error_count: safeNum(j.error_count),
      };
    });
    res.json({ events, count: events.length, generated_at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 2) VIZ: Success-Rate Chart per Domain ────────────────────────────
router.get('/success-rate', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, url, total_runs, error_count, data_collected, status
       FROM scraping_jobs
       WHERE total_runs > 0
       ORDER BY total_runs DESC
       LIMIT 50`
    );
    // Group by domain
    const byDomain = new Map();
    for (const j of r.rows) {
      const dom = extractDomain(j.url);
      const slot = byDomain.get(dom) || {
        domain: dom, total_runs: 0, error_count: 0, data_collected: 0, jobs: 0,
      };
      slot.total_runs += safeNum(j.total_runs);
      slot.error_count += safeNum(j.error_count);
      slot.data_collected += safeNum(j.data_collected);
      slot.jobs += 1;
      byDomain.set(dom, slot);
    }
    const rows = Array.from(byDomain.values()).map((s) => {
      const rate = s.total_runs > 0
        ? Math.max(0, Math.min(100, ((s.total_runs - s.error_count) / s.total_runs) * 100))
        : 0;
      return { ...s, success_rate: Math.round(rate * 10) / 10 };
    }).sort((a, b) => b.total_runs - a.total_runs);

    const totals = rows.reduce(
      (acc, r) => ({
        total_runs: acc.total_runs + r.total_runs,
        error_count: acc.error_count + r.error_count,
      }),
      { total_runs: 0, error_count: 0 }
    );
    const overall = totals.total_runs > 0
      ? Math.round(((totals.total_runs - totals.error_count) / totals.total_runs) * 1000) / 10
      : 0;

    res.json({ rows, overall_success_rate: overall, domain_count: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 3) NON-VIZ: Scraped-Data CSV Export ──────────────────────────────
router.get('/export-csv', async (req, res) => {
  try {
    const limit = Math.min(safeNum(req.query.limit, 200), 1000);
    const r = await pool.query(
      `SELECT sd.id, sd.job_id, sj.name AS job_name, sj.url AS job_url,
              sd.url, sd.scraped_at, sd.data
       FROM scraped_data sd
       LEFT JOIN scraping_jobs sj ON sd.job_id = sj.id
       ORDER BY sd.scraped_at DESC
       LIMIT $1`,
      [limit]
    );
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    };
    const header = ['id', 'job_id', 'job_name', 'domain', 'url', 'scraped_at', 'data_json'];
    const lines = [header.join(',')];
    for (const row of r.rows) {
      lines.push([
        row.id,
        row.job_id,
        esc(row.job_name),
        esc(extractDomain(row.job_url || row.url)),
        esc(row.url),
        esc(row.scraped_at ? new Date(row.scraped_at).toISOString() : ''),
        esc(row.data),
      ].join(','));
    }
    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="scraped_data_${Date.now()}.csv"`
    );
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 4) NON-VIZ: Scrape Rules Editor (CRUD selectors) ─────────────────
// In-memory registry seeded with common scrape rules. CRUD-only by design;
// persistence layer can be added without changing the public contract.
const rules = [
  { id: 1, name: 'Skip 404 pages',         target: 'response.status',         op: '!=', value: '404',  enabled: true,  selector: '' },
  { id: 2, name: 'Respect robots.txt',     target: 'robots.allow',            op: '==', value: 'true', enabled: true,  selector: '' },
  { id: 3, name: 'Throttle requests',      target: 'request.rate_per_sec',    op: '<=', value: '2',    enabled: true,  selector: '' },
  { id: 4, name: 'Require non-empty title',target: 'extracted.title.length',  op: '>',  value: '0',    enabled: true,  selector: 'h1' },
  { id: 5, name: 'Capture price',          target: 'extracted.price',         op: '>=', value: '0',    enabled: true,  selector: '.price' },
  { id: 6, name: 'Capture description',    target: 'extracted.description',   op: '!=', value: '',     enabled: false, selector: '.description' },
];
let nextId = rules.length + 1;

const sanitize = (body = {}) => ({
  name: body.name != null ? String(body.name).slice(0, 120) : undefined,
  target: body.target != null ? String(body.target).slice(0, 200) : undefined,
  op: body.op != null ? String(body.op).slice(0, 4) : undefined,
  value: body.value != null ? String(body.value).slice(0, 200) : undefined,
  selector: body.selector != null ? String(body.selector).slice(0, 200) : undefined,
  enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
});

router.get('/rules', (req, res) => {
  res.json({ rules, count: rules.length });
});

router.post('/rules', (req, res) => {
  const s = sanitize(req.body || {});
  if (!s.name || !s.target) {
    return res.status(400).json({ error: 'name and target are required' });
  }
  const rule = {
    id: nextId++,
    name: s.name,
    target: s.target,
    op: s.op || '==',
    value: s.value != null ? s.value : '',
    selector: s.selector != null ? s.selector : '',
    enabled: s.enabled !== false,
  };
  rules.push(rule);
  res.status(201).json({ rule });
});

router.put('/rules/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = rules.findIndex((r) => r.id === id);
  if (idx < 0) return res.status(404).json({ error: 'rule not found' });
  const s = sanitize(req.body || {});
  rules[idx] = {
    ...rules[idx],
    ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)),
    id,
  };
  res.json({ rule: rules[idx] });
});

router.delete('/rules/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = rules.findIndex((r) => r.id === id);
  if (idx < 0) return res.status(404).json({ error: 'rule not found' });
  const [removed] = rules.splice(idx, 1);
  res.json({ removed });
});

module.exports = router;
