CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scraping_jobs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  selectors JSONB DEFAULT '{}',
  schedule VARCHAR(100) DEFAULT '0 */6 * * *',
  status VARCHAR(50) DEFAULT 'active',
  last_run TIMESTAMP,
  total_runs INTEGER DEFAULT 0,
  data_collected INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scraped_data (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES scraping_jobs(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  url TEXT,
  scraped_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scraping_logs (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES scraping_jobs(id) ON DELETE CASCADE,
  agent VARCHAR(100) NOT NULL,
  action VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'info',
  message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
