import React from 'react';
import CuaFeaturePage from './CuaFeaturePage';

const LIST_COLS = [
  { key: 'id', label: 'ID' },
  { key: 'session_id', label: 'Session ID' },
  { key: 'handoff_reason', label: 'Reason' },
  { key: 'status', label: 'Status' },
  { key: 'urgency', label: 'Urgency' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'created_at', label: 'Created' },
];

const CREATE_FIELDS = [
  { name: 'session_id', label: 'Session ID', placeholder: 'Parent session UUID' },
  { name: 'handoff_reason', label: 'Handoff Reason', placeholder: 'CAPTCHA detected, requires human' },
  { name: 'urgency', label: 'Urgency', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
  { name: 'status', label: 'Status', type: 'select', options: ['pending', 'in-progress', 'resolved', 'cancelled'] },
  { name: 'assignee', label: 'Assignee', placeholder: 'operator@example.com' },
  { name: 'context_snapshot', label: 'Context Snapshot (JSON)', type: 'textarea', placeholder: '{"current_url": "…", "last_action": "…"}' },
];

const AI_VERBS = [
  { verb: 'classify-handoff-reason', label: 'Classify Handoff Reason' },
  { verb: 'predict-handoff-need', label: 'Predict Handoff Need' },
  { verb: 'suggest-context-to-pass', label: 'Suggest Context to Pass' },
  { verb: 'generate-handoff-summary', label: 'Generate Handoff Summary' },
  { verb: 'score-handoff-urgency', label: 'Score Handoff Urgency' },
  { verb: 'recommend-assignee', label: 'Recommend Assignee' },
  { verb: 'detect-cycle', label: 'Detect Handoff Cycle' },
  { verb: 'validate-handoff-completeness', label: 'Validate Handoff Completeness' },
  { verb: 'summarize-human-actions', label: 'Summarize Human Actions' },
  { verb: 'classify-return-to-bot-readiness', label: 'Classify Return-to-Bot Readiness' },
  { verb: 'predict-resolution-time', label: 'Predict Resolution Time' },
  { verb: 'recommend-training-data', label: 'Recommend Training Data' },
  { verb: 'generate-coach-feedback', label: 'Generate Coach Feedback' },
  { verb: 'score-handoff-quality', label: 'Score Handoff Quality' },
  { verb: 'detect-low-value-handoff', label: 'Detect Low-Value Handoff' },
  { verb: 'suggest-handoff-prevention', label: 'Suggest Handoff Prevention' },
];

export default function CuaHumanHandoffPage() {
  return (
    <CuaFeaturePage
      title="Human Handoff"
      slug="humanHandoff"
      listColumns={LIST_COLS}
      createFields={CREATE_FIELDS}
      aiVerbs={AI_VERBS}
      detailIdField="handoffId"
    />
  );
}
