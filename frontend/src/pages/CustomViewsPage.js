import React from 'react';
import ScrapeJobTimeline from '../components/customViews/ScrapeJobTimeline';
import SuccessRateChart from '../components/customViews/SuccessRateChart';
import ScrapedDataExport from '../components/customViews/ScrapedDataExport';
import ScrapeRulesEditor from '../components/customViews/ScrapeRulesEditor';

export default function CustomViewsPage() {
  return (
    <div
      data-testid="custom-views-page"
      style={{ padding: 24, background: '#1a1a2e', minHeight: '100vh', color: '#fff' }}
    >
      <h1 style={{ color: '#e94560', marginTop: 0 }}>Scraper Views</h1>
      <p style={{ color: '#a0a0b0', marginBottom: 24 }}>
        Custom dashboards for autonomous web scraping: per-job run timeline, per-domain
        success-rate, CSV export of scraped records, and a CRUD editor for scrape rules / selectors.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 20,
          marginBottom: 20,
        }}
      >
        <ScrapeJobTimeline />
        <SuccessRateChart />
      </div>

      <div style={{ marginBottom: 20 }}>
        <ScrapedDataExport />
      </div>

      <div>
        <ScrapeRulesEditor />
      </div>
    </div>
  );
}
