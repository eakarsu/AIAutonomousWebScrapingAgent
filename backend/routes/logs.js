/**
 * /backend/routes/logs.js
 *
 * Scraping logs with pagination.
 * Query params: job_id, agent, status, page, limit
 */
const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const { job_id, agent, status } = req.query;
    const conditions = [];
    const params = [];

    if (job_id) { params.push(job_id); conditions.push(`sl.job_id = $${params.length}`); }
    if (agent) { params.push(agent); conditions.push(`sl.agent = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`sl.status = $${params.length}`); }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total FROM scraping_logs sl ${whereClause}`, params),
      pool.query(
        `SELECT sl.*, sj.name as job_name FROM scraping_logs sl
         LEFT JOIN scraping_jobs sj ON sl.job_id = sj.id
         ${whereClause}
         ORDER BY sl.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
    ]);

    const total = parseInt(countResult.rows[0].total);
    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
