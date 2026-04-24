const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { job_id, agent, status } = req.query;
    let query = 'SELECT sl.*, sj.name as job_name FROM scraping_logs sl LEFT JOIN scraping_jobs sj ON sl.job_id = sj.id';
    const params = [];
    const conditions = [];
    if (job_id) { params.push(job_id); conditions.push(`sl.job_id = $${params.length}`); }
    if (agent) { params.push(agent); conditions.push(`sl.agent = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`sl.status = $${params.length}`); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY sl.created_at DESC LIMIT 200';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
