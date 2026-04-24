const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { job_id, search } = req.query;
    let query = 'SELECT sd.*, sj.name as job_name FROM scraped_data sd LEFT JOIN scraping_jobs sj ON sd.job_id = sj.id';
    const params = [];
    const conditions = [];
    if (job_id) { params.push(job_id); conditions.push(`sd.job_id = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`sd.data::text ILIKE $${params.length}`); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY sd.scraped_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT sd.*, sj.name as job_name FROM scraped_data sd LEFT JOIN scraping_jobs sj ON sd.job_id = sj.id WHERE sd.id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Data not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM scraped_data WHERE id = $1', [req.params.id]);
    res.json({ message: 'Data deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
