const pool = require('../models/db');
const cron = require('node-cron');

class SchedulerAgent {
  constructor() { this.name = 'schedulerAgent'; this.tasks = new Map(); }

  async log(jobId, action, status, message, durationMs) {
    await pool.query('INSERT INTO scraping_logs (job_id, agent, action, status, message, duration_ms) VALUES ($1, $2, $3, $4, $5, $6)',
      [jobId, this.name, action, status, message, durationMs]);
  }

  async getActiveJobs() {
    const result = await pool.query("SELECT * FROM scraping_jobs WHERE status = 'active'");
    return result.rows;
  }

  async execute(job) {
    const start = Date.now();
    try {
      await this.log(job.id, 'schedule', 'info', `Scheduling job: ${job.name} with cron: ${job.schedule}`, 0);
      await pool.query('UPDATE scraping_jobs SET last_run = NOW(), total_runs = total_runs + 1 WHERE id = $1', [job.id]);
      const duration = Date.now() - start;
      await this.log(job.id, 'complete', 'success', 'Job scheduled successfully', duration);
      return { success: true, duration };
    } catch (err) {
      await this.log(job.id, 'error', 'error', err.message, Date.now() - start);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new SchedulerAgent();
