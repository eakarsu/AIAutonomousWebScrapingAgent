const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config({ path: '../.env' });

const { aiLimiter, generalLimiter } = require('./middleware/rateLimiter');
const auth = require('./middleware/auth');

const app = express();

// Security headers
app.use(helmet());

// CORS restricted to CLIENT_URL (allow both 3000 and 3600)
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const ALLOWED = [CLIENT_URL, 'http://localhost:3000', 'http://localhost:3600'];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED.includes(origin)),
  credentials: true,
}));

// General rate limiter on all routes
app.use(generalLimiter);

app.use(express.json({ limit: '10mb' }));

// Public health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', auth, require('./routes/jobs'));
app.use('/api/data', auth, require('./routes/data'));
app.use('/api/logs', auth, require('./routes/logs'));

// AI agent routes — all subject to 20/hour rate limiter
app.use('/api/agents', auth, aiLimiter, require('./routes/agents'));
app.use('/api/agents', auth, aiLimiter, require('./routes/agentsNew'));
// Apply pass 5 — backlog endpoints (headless plan, proxy select, robots check, schema)
app.use('/api/agents', auth, aiLimiter, require('./routes/agentsBacklog'));
// Apply pass 5 wave-1 — additional backlog (data-classify, run-summary)
app.use('/api/agents', auth, aiLimiter, require('./routes/agentsBacklog2'));

// AI results history
app.use('/api/ai-results', auth, require('./routes/aiResults'));

// Competitive agents — AI limiter on the run sub-route
app.use('/api/competitive-agents', auth, aiLimiter, require('./routes/competitiveAgents'));

// Async job queue (rate-limited because it triggers AI under the hood)
app.use('/api/job-queue', auth, aiLimiter, require('./routes/jobQueue'));

// CSV export routes
app.use('/api/export', auth, require('./routes/export'));

// Stats endpoint (protected)
const pool = require('./models/db');
app.get('/api/stats', auth, async (req, res) => {
  try {
    const jobs = await pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'active\') as active FROM scraping_jobs');
    const data = await pool.query('SELECT COUNT(*) as total FROM scraped_data');
    const errors = await pool.query('SELECT COUNT(*) as total FROM scraping_logs WHERE status = \'error\'');
    const aiResults = await pool.query('SELECT COUNT(*) as total FROM ai_results').catch(() => ({ rows: [{ total: 0 }] }));
    res.json({
      totalJobs: parseInt(jobs.rows[0].total),
      activeJobs: parseInt(jobs.rows[0].active),
      dataCollected: parseInt(data.rows[0].total),
      errors: parseInt(errors.rows[0].total),
      aiAnalyses: parseInt(aiResults.rows[0].total),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// BATCH_00_AUDIT_MOUNTS
app.use('/api/selector-learning', require('./routes/selectorLearning'));
app.use('/api/puppeteer-control', require('./routes/puppeteerControl'));
app.use('/api/anomaly-stream', require('./routes/anomalyStream'));
app.use('/api/quality-validation', require('./routes/qualityValidation'));
app.use('/api/competitive-intel-enrich', require('./routes/competitiveIntelEnrich'));

// === Batch 00 Gaps & Frontend Mounts ===
app.use('/api/gap-ai-css-xpath-selector-auto', require('./routes/gap_ai_css_xpath_selector_auto'));
app.use('/api/gap-ai-extraction-over-unstructured-html', require('./routes/gap_ai_extraction_over_unstructured_html'));
app.use('/api/gap-ai-website-structure-change-anomaly', require('./routes/gap_ai_website_structure_change_anomaly'));
app.use('/api/gap-ai-field-classification-extracted-columns', require('./routes/gap_ai_field_classification_extracted_columns'));
app.use('/api/gap-headless-browser-engine-integration-puppeteer', require('./routes/gap_headless_browser_engine_integration_puppeteer'));
app.use('/api/gap-proxy-rotation', require('./routes/gap_proxy_rotation'));
app.use('/api/gap-robots-txt-aware-rate-limiting', require('./routes/gap_robots_txt_aware_rate_limiting'));
app.use('/api/gap-schema-based-data-validation', require('./routes/gap_schema_based_data_validation'));
app.use('/api/gap-notifications-subsystem', require('./routes/gap_notifications_subsystem'));
app.use('/api/gap-outbound-webhooks', require('./routes/gap_outbound_webhooks'));

// Custom Scraper Views (4 endpoints: timeline, success-rate, export-csv, rules)
app.use('/api/custom-views', auth, require('./routes/customViews'));
