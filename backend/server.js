const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: '../.env' });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/data', require('./routes/data'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/competitive-agents', require('./routes/competitiveAgents'));

// Stats endpoint
const pool = require('./models/db');
app.get('/api/stats', async (req, res) => {
  try {
    const jobs = await pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'active\') as active FROM scraping_jobs');
    const data = await pool.query('SELECT COUNT(*) as total FROM scraped_data');
    const errors = await pool.query('SELECT COUNT(*) as total FROM scraping_logs WHERE status = \'error\'');
    res.json({
      totalJobs: parseInt(jobs.rows[0].total),
      activeJobs: parseInt(jobs.rows[0].active),
      dataCollected: parseInt(data.rows[0].total),
      errors: parseInt(errors.rows[0].total)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
