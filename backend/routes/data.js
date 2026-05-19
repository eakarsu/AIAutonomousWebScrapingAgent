/**
 * /backend/routes/data.js
 *
 * Scraped data endpoints with pagination on GET /.
 * Query params: page, limit, job_id, search
 */

const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/data
// Query params: page, limit, job_id, search
// ---------------------------------------------------------------------------
router.get('/', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (req.query.job_id) {
      params.push(req.query.job_id);
      conditions.push(`sd.job_id = $${params.length}`);
    }

    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      conditions.push(`sd.data::text ILIKE $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM scraped_data sd ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const dataResult = await pool.query(
      `SELECT sd.*, sj.name as job_name
       FROM scraped_data sd
       LEFT JOIN scraping_jobs sj ON sd.job_id = sj.id
       ${whereClause}
       ORDER BY sd.scraped_at DESC
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
// GET /api/data/:id
// ---------------------------------------------------------------------------
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sd.*, sj.name as job_name
       FROM scraped_data sd
       LEFT JOIN scraping_jobs sj ON sd.job_id = sj.id
       WHERE sd.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Data not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/data/:id
// ---------------------------------------------------------------------------
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM scraped_data WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Data not found' });
    res.json({ message: 'Data deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
