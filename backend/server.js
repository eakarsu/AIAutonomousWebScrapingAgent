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
app.use('/api/runtime-ai', aiLimiter, require('./routes/runtimeAi'));
app.use('/api/jobs', auth, require('./routes/jobs'));
app.use('/api/data', auth, require('./routes/data'));
app.use('/api/logs', auth, require('./routes/logs'));
app.use('/api/governed-crawls', require('./routes/governedCrawls'));

// AI agent routes — all subject to 20/hour rate limiter. The frontend calls
// /api/agents/* for these AI features, so they must be mounted or it 404s.
app.use('/api/agents', auth, aiLimiter, require('./routes/agents'));
app.use('/api/agents', auth, aiLimiter, require('./routes/agentsNew'));
app.use('/api/agents', auth, aiLimiter, require('./routes/agentsBacklog'));
app.use('/api/agents', auth, aiLimiter, require('./routes/agentsBacklog2'));

// AI results history
app.use('/api/ai-results', auth, require('./routes/aiResults'));

// Competitive agents + async job queue (both invoke AI) — the frontend calls
// /api/competitive-agents/* and /api/job-queue/*, so mount them.
app.use('/api/competitive-agents', auth, aiLimiter, require('./routes/competitiveAgents'));
app.use('/api/job-queue', auth, aiLimiter, require('./routes/jobQueue'));

// CSV export routes
app.use('/api/export', auth, require('./routes/export'));
app.use('/api/feature-pack', require('./routes/featurePack27a').createFeaturePackRouter({ authenticate: auth, loadRecords: async () => (await require('./models/db').query('SELECT * FROM scraping_jobs ORDER BY created_at DESC LIMIT 200')).rows }));

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

// Advisory AI reports only; native execution and approval routes stay unchanged.
const aiWorkspaceSupport = require("./aiWorkspaceAdapters.cjs");
const aiWorkspaceDatabase = require("./models/db.js");
app.use('/api/report-workspace', require("./aiWorkspace.cjs").createAIWorkspaceRouter({
  pool: aiWorkspaceDatabase, authenticateToken: require("./middleware/auth.js"),
  aiRateLimiter: aiWorkspaceSupport.createWorkspaceLimiter(), features: require("./aiWorkspaceFeatures.json"),
}));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Unauthenticated browser-control and generated gap routes are quarantined.

// Custom Scraper Views (4 endpoints: timeline, success-rate, export-csv, rules)
app.use('/api/custom-views', auth, require('./routes/customViews'));

// CUA platform — the frontend CUA pages call /api/cua/<slug> (CRUD + AI verbs).
const { setupCuaTables } = require('./models/cua');
const cuaPool = require('./models/db');
setupCuaTables(cuaPool);
app.use('/api/cua/desktopControl', require('./routes/cuaFeat_desktopControl'));
app.use('/api/cua/screenCapture', require('./routes/cuaFeat_screenCapture'));
app.use('/api/cua/clickPlanner', require('./routes/cuaFeat_clickPlanner'));
app.use('/api/cua/formFiller', require('./routes/cuaFeat_formFiller'));
app.use('/api/cua/multiTabOrchestration', require('./routes/cuaFeat_multiTabOrchestration'));
app.use('/api/cua/sessionRecording', require('./routes/cuaFeat_sessionRecording'));
app.use('/api/cua/humanHandoff', require('./routes/cuaFeat_humanHandoff'));
app.use('/api/cua/cuaPolicyGuard', require('./routes/cuaFeat_cuaPolicyGuard'));
