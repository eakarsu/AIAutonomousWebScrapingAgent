'use strict';

const bcrypt = require('bcryptjs');
const pool = require('../models/db');

async function main() {
  if (!['1', 'true'].includes(process.env.ALLOW_SCHEMA_MIGRATION)) throw new Error('Explicit provisioning acknowledgement is required');
  const email = (process.env.PROVISION_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.PROVISION_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || '';
  if (!email || password.length < 12) throw new Error('Explicit admin email and 12+ character password are required');
  await pool.query(
    `INSERT INTO users (email, password, name) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password=EXCLUDED.password, name=EXCLUDED.name`,
    [email, await bcrypt.hash(password, 12), 'Runtime Administrator'],
  );
  console.log('Administrator provisioned.');
  await pool.end();
}

main().catch(async (error) => { console.error(error.message); await pool.end().catch(() => {}); process.exitCode = 1; });
