import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from './services/api';
import JobsPage from './pages/JobsPage';
import DataPage from './pages/DataPage';
import LogsPage from './pages/LogsPage';
import DashboardPage from './pages/DashboardPage';
import JobQueuePage from './pages/JobQueuePage';
import AIResultsPage from './pages/AIResultsPage';
import FullFieldPresets from './components/FullFieldPresets';
import AIReport from './components/AIReport';
import LoginPage from './pages/LoginPage';

jest.mock('./services/api', () => ({ __esModule: true, default: {
  getJobs: jest.fn(), getData: jest.fn(), getLogs: jest.fn(), getStats: jest.fn(), listQueueJobs: jest.fn(), getAIResults: jest.fn(), getAIResult: jest.fn()
} }));

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  // Names match the repository's 18 non-destructive fixture examples in backend/seeds/seed.js.
  const names = ['Amazon Product Prices', 'Indeed Job Listings', 'Reuters News Headlines', 'GitHub Trending Repos', 'Zillow Real Estate', 'Yelp Restaurant Reviews', 'Stack Overflow Questions', 'Weather Data Collector', 'ESPN Sports Scores', 'TechCrunch Articles', 'LinkedIn Company Data', 'Reddit Trending Posts', 'Booking.com Hotels', 'Craigslist Classifieds', 'Twitter/X Trends', 'Hacker News Front Page', 'Glassdoor Salaries', 'Product Hunt Launches'];
  const items = names.map((name, i) => ({ id: i+1, name, url: 'https://example.com', status: 'active', job_name: name, data: { title: name }, scraped_at: new Date().toISOString(), created_at: new Date().toISOString(), job_type: 'scrape_url', endpoint: 'analyze-url' }));
  api.getJobs.mockResolvedValue({data: items, pagination: {total: 18}});
  api.getData.mockResolvedValue({data: items, pagination: {total: 18}});
  api.getLogs.mockResolvedValue({data: items, pagination: {total: 18}});
  api.listQueueJobs.mockResolvedValue({data: items, pagination: {total: 18}});
  api.getAIResults.mockResolvedValue({data: items, pagination: {total: 18}});
  api.getStats.mockResolvedValue({totalJobs: 18, activeJobs: 18, dataCollected: 18, errors: 0});
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.clearAllMocks(); });
const mount = async (component) => { await act(async () => { root.render(<MemoryRouter>{component}</MemoryRouter>); await Promise.resolve(); }); };

test.each([
  ['Jobs', <JobsPage />, 'Scraping Jobs'],
  ['Data', <DataPage />, 'Scraped Data'],
  ['Logs', <LogsPage />, 'Agent Logs'],
  ['Dashboard recent jobs', <DashboardPage />, 'Recent Jobs'],
  ['Queue', <JobQueuePage />, 'Async Job Queue'],
])('%s renders 18 real-shape fixture rows without a runtime error', async (_, component, heading) => {
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  try { await mount(component); expect(host.textContent).toContain(heading); expect(host.querySelectorAll('tbody tr').length).toBe(18); expect(errors).not.toHaveBeenCalled(); }
  finally { errors.mockRestore(); }
});

test('AI history renders 18 cards, and saved detail formats scalars and nested values', async () => {
  api.getAIResult.mockResolvedValue({endpoint: 'analyze-url', result: {summary: {enabled: false, count: 0, note: ''}, findings: [{label: 'A', score: 0}]}});
  await mount(<AIResultsPage />);
  expect(host.querySelectorAll('main > div button').length).toBe(18);
  await act(async () => { host.querySelector('main > div button').click(); await Promise.resolve(); });
  expect(host.textContent).toContain('Enabled');
  expect(host.textContent).toContain('No');
  expect(host.textContent).toContain('0');
  expect(host.textContent).toContain('""');
  expect(host.querySelector('table')).not.toBeNull();
});

test('preset fills optional fields and preserves a selected record and file without submitting', async () => {
  const file = new File(['test'], 'sample.html');
  const onChange = jest.fn();
  await mount(<form onSubmit={() => { throw Error('preset submitted'); }}><FullFieldPresets value={{url:'', description:'', record_id: 27, upload: file}} onChange={onChange} presets={[{label:'Catalog example', values:{url:'https://example.com/catalog', description:'Extract product titles and prices', record_id: 999, upload: null}}]} /></form>);
  await act(async () => host.querySelector('button').click());
  expect(onChange).toHaveBeenCalledWith({url:'https://example.com/catalog', description:'Extract product titles and prices', record_id:27, upload:file});
});

test('returned report labels nested values and keeps false, zero, and empty string', async () => {
  await mount(<AIReport response={{summary:{enabled:false, count:0, note:''}, findings:[{label:'A',score:0}]}} />);
  expect(host.textContent).toContain('Enabled'); expect(host.textContent).toContain('No');
  expect(host.textContent).toContain('0'); expect(host.textContent).toContain('""'); expect(host.querySelector('table')).not.toBeNull();
});

test('demo button fills configured values and never posts login', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ok:true,json:async () => ({email:'demo@example.test',password:'fixture-only'})});
  global.fetch = fetchMock;
  await mount(<LoginPage onLogin={jest.fn()} />);
  await act(async () => {host.querySelector('button[aria-label="Fill demo credentials"]').click(); await Promise.resolve();});
  expect(host.querySelector('input[type=email]').value).toBe('demo@example.test');
  expect(host.querySelector('input[type=password]').value).toBe('fixture-only');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/demo-credentials');
});
