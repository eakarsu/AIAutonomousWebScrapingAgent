import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import DataPage from './pages/DataPage';
import LogsPage from './pages/LogsPage';
import AgentsPage from './pages/AgentsPage';
import CompetitiveAgentsPage from './pages/CompetitiveAgentsPage';
import ScheduleOptimizerPage from './pages/ScheduleOptimizerPage';
import QualityValidatorPage from './pages/QualityValidatorPage';
import SelectorRecommenderPage from './pages/SelectorRecommenderPage';
import AnomalyAlertsPage from './pages/AnomalyAlertsPage';
import JobQueuePage from './pages/JobQueuePage';
import CompetitiveAgentsManagerPage from './pages/CompetitiveAgentsManagerPage';
import ExportPage from './pages/ExportPage';
import BacklogToolsPage from './pages/BacklogToolsPage';
import CustomViewsPage from './pages/CustomViewsPage';

export default function App() {
  const [authenticated, setAuthenticated] = useState(!!localStorage.getItem('token'));

  if (!authenticated) return <LoginPage onLogin={() => setAuthenticated(true)} />;

  return (
    <BrowserRouter>
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div style={{ marginLeft: 250, flex: 1, minHeight: '100vh' }}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/competitive-agents" element={<CompetitiveAgentsPage />} />
            <Route path="/schedule-optimizer" element={<ScheduleOptimizerPage />} />
            <Route path="/quality-validator" element={<QualityValidatorPage />} />
            <Route path="/selector-recommender" element={<SelectorRecommenderPage />} />
            <Route path="/anomaly-alerts" element={<AnomalyAlertsPage />} />
            <Route path="/job-queue" element={<JobQueuePage />} />
            <Route path="/competitive-agents-manager" element={<CompetitiveAgentsManagerPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/backlog-tools" element={<BacklogToolsPage />} />
            <Route path="/custom-views" element={<CustomViewsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
