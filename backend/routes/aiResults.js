/**
 * /backend/routes/aiResults.js
 *
 * AI Results history endpoint.
 * GET /api/ai-results — paginated list of persisted AI analyses.
 * Query params: page, limit, endpoint
 */

const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const router = express.Router();

// GET /api/ai-results
router.get('/', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = ['user_id = $1'];
    const params = [req.user.id];

    if (req.query.endpoint) {
      params.push(req.query.endpoint);
      conditions.push(`endpoint = $${params.length}`);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total FROM ai_results ${whereClause}`, params),
      pool.query(
        `SELECT id, endpoint, model, input_summary, result, created_at
         FROM ai_results ${whereClause}
         ORDER BY created_at DESC
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai-results/:id — single result
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ai_results WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Result not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
