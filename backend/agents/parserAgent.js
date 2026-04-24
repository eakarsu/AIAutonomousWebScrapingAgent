const pool = require('../models/db');
const cheerio = require('cheerio');

class ParserAgent {
  constructor() { this.name = 'parserAgent'; }

  async log(jobId, action, status, message, durationMs) {
    await pool.query('INSERT INTO scraping_logs (job_id, agent, action, status, message, duration_ms) VALUES ($1, $2, $3, $4, $5, $6)',
      [jobId, this.name, action, status, message, durationMs]);
  }

  async execute(job, html) {
    const start = Date.now();
    try {
      await this.log(job.id, 'parse', 'info', 'Parsing HTML content', 0);
      const $ = cheerio.load(html || '<html></html>');
      const selectors = typeof job.selectors === 'string' ? JSON.parse(job.selectors) : job.selectors;
      const extracted = {};
      for (const [key, selector] of Object.entries(selectors || {})) {
        extracted[key] = [];
        $(selector).each((i, el) => { extracted[key].push($(el).text().trim()); });
      }
      const duration = Date.now() - start;
      await this.log(job.id, 'complete', 'success', `Extracted ${Object.keys(extracted).length} fields`, duration);
      return { success: true, data: extracted, duration };
    } catch (err) {
      await this.log(job.id, 'error', 'error', err.message, Date.now() - start);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new ParserAgent();
