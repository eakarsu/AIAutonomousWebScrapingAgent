import React from 'react';
import CuaFeaturePage from './CuaFeaturePage';

const LIST_COLS = [
  { key: 'id', label: 'ID' },
  { key: 'session_id', label: 'Session ID' },
  { key: 'tab_count', label: '# Tabs' },
  { key: 'active_tab_index', label: 'Active Tab' },
  { key: 'status', label: 'Status' },
  { key: 'orchestration_mode', label: 'Mode' },
  { key: 'created_at', label: 'Created' },
];

const CREATE_FIELDS = [
  { name: 'session_id', label: 'Session ID', placeholder: 'Parent session UUID' },
  { name: 'orchestration_mode', label: 'Orchestration Mode', type: 'select', options: ['sequential', 'parallel', 'round-robin'] },
  { name: 'tab_urls', label: 'Tab URLs (JSON array)', type: 'textarea', placeholder: '["https://example.com", "https://other.com"]' },
  { name: 'status', label: 'Status', type: 'select', options: ['idle', 'running', 'paused', 'completed', 'error'] },
  { name: 'max_tabs', label: 'Max Tabs', type: 'number', placeholder: '5' },
];

const AI_VERBS = [
  { verb: 'classify-tab-purpose', label: 'Classify Tab Purpose' },
  { verb: 'suggest-tab-grouping', label: 'Suggest Tab Grouping' },
  { verb: 'predict-tab-load', label: 'Predict Tab Load Time' },
  { verb: 'detect-tab-leak', label: 'Detect Tab Leak' },
  { verb: 'recommend-tab-close', label: 'Recommend Tab Close' },
  { verb: 'score-tab-relevance', label: 'Score Tab Relevance' },
  { verb: 'generate-tab-summary', label: 'Generate Tab Summary' },
  { verb: 'validate-tab-context-isolation', label: 'Validate Context Isolation' },
  { verb: 'detect-tab-deadlock', label: 'Detect Tab Deadlock' },
  { verb: 'classify-window-vs-tab', label: 'Classify Window vs Tab' },
  { verb: 'predict-focus-loss', label: 'Predict Focus Loss' },
  { verb: 'suggest-context-switch', label: 'Suggest Context Switch' },
  { verb: 'summarize-tab-state', label: 'Summarize Tab State' },
  { verb: 'recommend-priority-tab', label: 'Recommend Priority Tab' },
  { verb: 'detect-cross-tab-data-leak', label: 'Detect Cross-Tab Data Leak' },
  { verb: 'score-orchestration-health', label: 'Score Orchestration Health' },
];

export default function CuaMultiTabPage() {
  return (
    <CuaFeaturePage
      title="Multi-Tab Orchestration"
      slug="multiTabOrchestration"
      listColumns={LIST_COLS}
      createFields={CREATE_FIELDS}
      aiVerbs={AI_VERBS}
      detailIdField="orchestrationId"
    />
  );
}
