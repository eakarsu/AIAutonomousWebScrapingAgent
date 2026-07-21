const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined });

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

module.exports = pool;
