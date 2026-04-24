const pool = require('../models/db');
const axios = require('axios');
const cheerio = require('cheerio');

class CrawlerAgent {
  constructor() { this.name = 'crawlerAgent'; }

  async log(jobId, action, status, message, durationMs) {
    await pool.query('INSERT INTO scraping_logs (job_id, agent, action, status, message, duration_ms) VALUES ($1, $2, $3, $4, $5, $6)',
      [jobId, this.name, action, status, message, durationMs]);
  }

  async execute(job) {
    const start = Date.now();
    try {
      await this.log(job.id, 'crawl', 'info', `Starting crawl of ${job.url}`, 0);
      const response = await axios.get(job.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScrapingBot/1.0)' },
        timeout: 30000
      });
      const html = response.data;
      const duration = Date.now() - start;
      await this.log(job.id, 'complete', 'success', `Crawled ${html.length} bytes`, duration);
      return { success: true, html, duration };
    } catch (err) {
      await this.log(job.id, 'error', 'error', err.message, Date.now() - start);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new CrawlerAgent();
