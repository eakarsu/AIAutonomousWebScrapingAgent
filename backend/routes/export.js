/**
 * /backend/routes/export.js
 *
 * CSV export endpoints:
 *   GET /api/export/jobs
 *   GET /api/export/data
 *
 * Query params for /data: job_id, search
 * Query params for /jobs: status, search
 *
 * Builds CSV with plain string construction (no external CSV library required).
 */

const express = require('express');
const pool = require('../models/db');
const auth = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * Escape a single CSV cell value.
 * Wraps in quotes if it contains commas, quotes, or newlines.
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of row objects to a CSV string.
 * @param {object[]} rows
 * @param {string[]} columns - ordered list of column names to include
 * @returns {string}
 */
function buildCSV(rows, columns) {
  const header = columns.map(escapeCSV).join(',');
  const lines = rows.map((row) =>
    columns.map((col) => escapeCSV(row[col])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

// ---------------------------------------------------------------------------
// GET /api/export/jobs
// Exports all scraping jobs as CSV.
// Query params: status, search
// ---------------------------------------------------------------------------
router.get('/jobs', auth, async (req, res) => {
  try {
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

    const result = await pool.query(
      `SELECT id, name, url, schedule, status, created_by, created_at, updated_at
       FROM scraping_jobs ${whereClause}
       ORDER BY created_at DESC
       LIMIT 10000`,
      params
    );

    const columns = ['id', 'name', 'url', 'schedule', 'status', 'created_by', 'created_at', 'updated_at'];
    const csv = buildCSV(result.rows, columns);

    const filename = `scraping-jobs-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[export/jobs]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/export/data
// Exports scraped data as CSV.
// Query params: job_id, search
// ---------------------------------------------------------------------------
router.get('/data', auth, async (req, res) => {
  try {
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

    const result = await pool.query(
      `SELECT sd.id, sd.job_id, sj.name as job_name, sd.url, sd.scraped_at,
              sd.data::text as data_json, sd.status
       FROM scraped_data sd
       LEFT JOIN scraping_jobs sj ON sd.job_id = sj.id
       ${whereClause}
       ORDER BY sd.scraped_at DESC
       LIMIT 10000`,
      params
    );

    const columns = ['id', 'job_id', 'job_name', 'url', 'scraped_at', 'data_json', 'status'];
    const csv = buildCSV(result.rows, columns);

    const filename = `scraped-data-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[export/data]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
