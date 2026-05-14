/**
 * /backend/routes/jobs.js
 *
 * Scraping jobs CRUD with pagination on GET /.
 * Query params: page, limit, status, search
 */

const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const crawlerAgent = require('../agents/crawlerAgent');
const parserAgent = require('../agents/parserAgent');
const cleanerAgent = require('../agents/cleanerAgent');
const storageAgent = require('../agents/storageAgent');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/jobs
// Query params: page, limit, status, search
// ---------------------------------------------------------------------------
router.get('/', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (req.query.status) {
      params.push(req.query.status);
      conditions.push(`status = $${params.length}`);
    }

    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      conditions.push(`(name ILIKE $${params.length} OR url ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM scraping_jobs ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const dataResult = await pool.query(
      `SELECT * FROM scraping_jobs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id
// ---------------------------------------------------------------------------
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM scraping_jobs WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs
// ---------------------------------------------------------------------------
router.post('/', auth, async (req, res) => {
  try {
    const { name, url, selectors, schedule, status } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "'name' and 'url' are required" });
    }

    const result = await pool.query(
      'INSERT INTO scraping_jobs (name, url, selectors, schedule, status, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, url, JSON.stringify(selectors || {}), schedule || '0 */6 * * *', status || 'active', req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/jobs/:id
// ---------------------------------------------------------------------------
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, url, selectors, schedule, status } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "'name' and 'url' are required" });
    }

    const result = await pool.query(
      'UPDATE scraping_jobs SET name=$1, url=$2, selectors=$3, schedule=$4, status=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
      [name, url, JSON.stringify(selectors || {}), schedule, status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/jobs/:id
// ---------------------------------------------------------------------------
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM scraping_jobs WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    res.json({ message: 'Job deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/run
// Manually trigger the full crawl → parse → clean → store pipeline.
// ---------------------------------------------------------------------------
router.post('/:id/run', auth, async (req, res) => {
  try {
    const jobResult = await pool.query('SELECT * FROM scraping_jobs WHERE id = $1', [req.params.id]);
    if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = jobResult.rows[0];

    // Run pipeline asynchronously, respond immediately
    res.json({ message: 'Job run triggered', job_id: job.id, status: 'running' });

    // Execute pipeline in background
    (async () => {
      try {
        // Update total_runs counter
        await pool.query('UPDATE scraping_jobs SET total_runs = total_runs + 1, last_run = NOW() WHERE id = $1', [job.id]);

        // Step 1: Crawl
        const crawlResult = await crawlerAgent.execute(job);
        if (!crawlResult.success) {
          await pool.query('UPDATE scraping_jobs SET error_count = error_count + 1 WHERE id = $1', [job.id]);
          return;
        }

        // Step 2: Parse
        const parseResult = await parserAgent.execute(job, crawlResult.html);
        if (!parseResult.success) {
          await pool.query('UPDATE scraping_jobs SET error_count = error_count + 1 WHERE id = $1', [job.id]);
          return;
        }

        // Step 3: Clean
        const cleanResult = await cleanerAgent.execute(job, parseResult.data);
        if (!cleanResult.success) {
          await pool.query('UPDATE scraping_jobs SET error_count = error_count + 1 WHERE id = $1', [job.id]);
          return;
        }

        // Step 4: Store
        await storageAgent.execute(job, cleanResult.data);
      } catch (pipelineErr) {
        console.error(`[job-run] Pipeline error for job ${job.id}:`, pipelineErr.message);
        await pool.query('UPDATE scraping_jobs SET error_count = error_count + 1 WHERE id = $1', [job.id]).catch(() => {});
      }
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
