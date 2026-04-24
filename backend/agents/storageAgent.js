const pool = require('../models/db');

class StorageAgent {
  constructor() { this.name = 'storageAgent'; }

  async log(jobId, action, status, message, durationMs) {
    await pool.query('INSERT INTO scraping_logs (job_id, agent, action, status, message, duration_ms) VALUES ($1, $2, $3, $4, $5, $6)',
      [jobId, this.name, action, status, message, durationMs]);
  }

  async execute(job, data) {
    const start = Date.now();
    try {
      await this.log(job.id, 'store', 'info', 'Storing cleaned data', 0);
      await pool.query('INSERT INTO scraped_data (job_id, data, url) VALUES ($1, $2, $3)',
        [job.id, JSON.stringify(data), job.url]);
      await pool.query('UPDATE scraping_jobs SET data_collected = data_collected + 1, last_run = NOW() WHERE id = $1', [job.id]);
      const duration = Date.now() - start;
      await this.log(job.id, 'complete', 'success', 'Data stored successfully', duration);
      return { success: true, duration };
    } catch (err) {
      await this.log(job.id, 'error', 'error', err.message, Date.now() - start);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new StorageAgent();
