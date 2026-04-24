const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '../../.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_web_scraping_db'
});

async function seed() {
  try {
    // Clear existing data
    await pool.query('DELETE FROM scraping_logs');
    await pool.query('DELETE FROM scraped_data');
    await pool.query('DELETE FROM scraping_jobs');
    await pool.query('DELETE FROM users');

    // Create admin user
    const hashed = await bcrypt.hash('admin123', 10);
    const userResult = await pool.query(
      "INSERT INTO users (email, password, name) VALUES ('admin@example.com', $1, 'Admin User') RETURNING id", [hashed]
    );
    const userId = userResult.rows[0].id;

    // Seed 18 scraping jobs
    const jobs = [
      { name: 'Amazon Product Prices', url: 'https://amazon.com/bestsellers', schedule: '0 */4 * * *', status: 'active', runs: 145, data: 2340, errors: 3 },
      { name: 'Indeed Job Listings', url: 'https://indeed.com/jobs?q=developer', schedule: '0 */2 * * *', status: 'active', runs: 298, data: 5621, errors: 12 },
      { name: 'Reuters News Headlines', url: 'https://reuters.com/world', schedule: '*/30 * * * *', status: 'active', runs: 1420, data: 8930, errors: 5 },
      { name: 'GitHub Trending Repos', url: 'https://github.com/trending', schedule: '0 */6 * * *', status: 'active', runs: 89, data: 1200, errors: 0 },
      { name: 'Zillow Real Estate', url: 'https://zillow.com/homes/for_sale', schedule: '0 8 * * *', status: 'paused', runs: 67, data: 890, errors: 2 },
      { name: 'Yelp Restaurant Reviews', url: 'https://yelp.com/search?find_desc=restaurants', schedule: '0 */12 * * *', status: 'active', runs: 45, data: 670, errors: 1 },
      { name: 'Stack Overflow Questions', url: 'https://stackoverflow.com/questions', schedule: '0 */3 * * *', status: 'active', runs: 234, data: 4560, errors: 8 },
      { name: 'Weather Data Collector', url: 'https://weather.gov/forecasts', schedule: '*/15 * * * *', status: 'active', runs: 5600, data: 16800, errors: 0 },
      { name: 'ESPN Sports Scores', url: 'https://espn.com/scores', schedule: '*/5 * * * *', status: 'active', runs: 8900, data: 26700, errors: 15 },
      { name: 'TechCrunch Articles', url: 'https://techcrunch.com', schedule: '0 */4 * * *', status: 'active', runs: 156, data: 2100, errors: 4 },
      { name: 'LinkedIn Company Data', url: 'https://linkedin.com/companies', schedule: '0 6 * * 1', status: 'paused', runs: 23, data: 340, errors: 7 },
      { name: 'Reddit Trending Posts', url: 'https://reddit.com/r/popular', schedule: '0 */1 * * *', status: 'active', runs: 720, data: 9800, errors: 2 },
      { name: 'Booking.com Hotels', url: 'https://booking.com/searchresults', schedule: '0 */8 * * *', status: 'active', runs: 78, data: 1560, errors: 3 },
      { name: 'Craigslist Classifieds', url: 'https://craigslist.org/search', schedule: '0 */6 * * *', status: 'error', runs: 34, data: 450, errors: 22 },
      { name: 'Twitter/X Trends', url: 'https://x.com/explore/trending', schedule: '*/10 * * * *', status: 'active', runs: 4320, data: 12960, errors: 45 },
      { name: 'Hacker News Front Page', url: 'https://news.ycombinator.com', schedule: '0 */2 * * *', status: 'active', runs: 365, data: 5400, errors: 1 },
      { name: 'Glassdoor Salaries', url: 'https://glassdoor.com/Salaries', schedule: '0 0 * * 1', status: 'active', runs: 52, data: 780, errors: 0 },
      { name: 'Product Hunt Launches', url: 'https://producthunt.com', schedule: '0 10 * * *', status: 'active', runs: 89, data: 1230, errors: 2 }
    ];

    for (const job of jobs) {
      const jr = await pool.query(
        'INSERT INTO scraping_jobs (name, url, selectors, schedule, status, total_runs, data_collected, error_count, created_by, last_run) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - INTERVAL \'1 hour\' * (random()*48)::int) RETURNING id',
        [job.name, job.url, JSON.stringify({title: 'h1', content: '.main-content', price: '.price'}), job.schedule, job.status, job.runs, job.data, job.errors, userId]
      );

      // Add some scraped data for each job
      for (let i = 0; i < 3; i++) {
        await pool.query(
          'INSERT INTO scraped_data (job_id, data, url, scraped_at) VALUES ($1, $2, $3, NOW() - INTERVAL \'1 hour\' * $4)',
          [jr.rows[0].id, JSON.stringify({title: `Sample data ${i+1} from ${job.name}`, value: Math.random()*1000, category: 'auto-scraped'}), job.url, i * 2]
        );
      }

      // Add logs
      const agents = ['schedulerAgent', 'crawlerAgent', 'parserAgent', 'cleanerAgent', 'storageAgent'];
      for (const agent of agents) {
        await pool.query(
          'INSERT INTO scraping_logs (job_id, agent, action, status, message, duration_ms) VALUES ($1, $2, $3, $4, $5, $6)',
          [jr.rows[0].id, agent, 'execute', 'success', `${agent} processed ${job.name}`, Math.floor(Math.random()*5000)]
        );
      }
    }

    console.log('✅ Seed completed: 18 jobs, scraped data, and logs created');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
