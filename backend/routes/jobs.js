const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM scraping_jobs ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM scraping_jobs WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, url, selectors, schedule, status } = req.body;
    const result = await pool.query(
      'INSERT INTO scraping_jobs (name, url, selectors, schedule, status, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, url, JSON.stringify(selectors || {}), schedule || '0 */6 * * *', status || 'active', req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name, url, selectors, schedule, status } = req.body;
    const result = await pool.query(
      'UPDATE scraping_jobs SET name=$1, url=$2, selectors=$3, schedule=$4, status=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
      [name, url, JSON.stringify(selectors || {}), schedule, status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM scraping_jobs WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    res.json({ message: 'Job deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
