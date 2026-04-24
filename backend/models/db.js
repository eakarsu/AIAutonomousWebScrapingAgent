const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_web_scraping_db'
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

module.exports = pool;
