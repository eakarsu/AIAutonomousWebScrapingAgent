const pool = require('../models/db');

class CleanerAgent {
  constructor() { this.name = 'cleanerAgent'; }

  async log(jobId, action, status, message, durationMs) {
    await pool.query('INSERT INTO scraping_logs (job_id, agent, action, status, message, duration_ms) VALUES ($1, $2, $3, $4, $5, $6)',
      [jobId, this.name, action, status, message, durationMs]);
  }

  async execute(job, data) {
    const start = Date.now();
    try {
      await this.log(job.id, 'clean', 'info', 'Cleaning extracted data', 0);
      const cleaned = JSON.parse(JSON.stringify(data));
      // Remove empty strings, trim whitespace, dedup
      for (const key of Object.keys(cleaned)) {
        if (Array.isArray(cleaned[key])) {
          cleaned[key] = [...new Set(cleaned[key].filter(v => v && v.trim()).map(v => v.trim()))];
        }
      }
      const duration = Date.now() - start;
      await this.log(job.id, 'complete', 'success', 'Data cleaned successfully', duration);
      return { success: true, data: cleaned, duration };
    } catch (err) {
      await this.log(job.id, 'error', 'error', err.message, Date.now() - start);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new CleanerAgent();
