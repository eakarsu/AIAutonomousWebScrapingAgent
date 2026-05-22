import React from 'react';
import CuaFeaturePage from './CuaFeaturePage';

const LIST_COLS = [
  { key: 'id', label: 'ID' },
  { key: 'policy_name', label: 'Policy Name' },
  { key: 'action_type', label: 'Action Type' },
  { key: 'decision', label: 'Decision' },
  { key: 'risk_score', label: 'Risk Score' },
  { key: 'pii_detected', label: 'PII' },
  { key: 'created_at', label: 'Created' },
];

const CREATE_FIELDS = [
  { name: 'policy_name', label: 'Policy Name', placeholder: 'NoExternalPOST' },
  { name: 'action_type', label: 'Action Type', placeholder: 'click, type, navigate, submit…' },
  { name: 'action_payload', label: 'Action Payload (JSON)', type: 'textarea', placeholder: '{"url": "https://external.com", "method": "POST"}' },
  { name: 'decision', label: 'Decision', type: 'select', options: ['allow', 'deny', 'review', 'redact'] },
  { name: 'session_id', label: 'Session ID (optional)', placeholder: 'Session UUID' },
];

const AI_VERBS = [
  { verb: 'classify-action-against-policy', label: 'Classify Action Against Policy', extraFields: [{ name: 'actionPayload', label: 'Action Payload (JSON)', placeholder: '{"type":"click","target":"#pay"}' }] },
  { verb: 'detect-policy-violation', label: 'Detect Policy Violation' },
  { verb: 'suggest-policy-rule', label: 'Suggest Policy Rule' },
  { verb: 'score-action-policy-risk', label: 'Score Action Policy Risk', extraFields: [{ name: 'actionPayload', label: 'Action Payload (JSON)', placeholder: '{"url":"https://external.com"}' }] },
  { verb: 'recommend-allow-deny', label: 'Recommend Allow / Deny' },
  { verb: 'validate-policy-config', label: 'Validate Policy Config' },
  { verb: 'generate-policy-explanation', label: 'Generate Policy Explanation' },
  { verb: 'summarize-policy-events', label: 'Summarize Policy Events' },
  { verb: 'predict-policy-conflict', label: 'Predict Policy Conflict' },
  { verb: 'classify-pii-in-action', label: 'Classify PII in Action', extraFields: [{ name: 'actionPayload', label: 'Action Payload (JSON)', placeholder: '{"value":"John Smith, SSN: 123-45-6789"}' }] },
  { verb: 'redact-action-payload', label: 'Redact Action Payload' },
  { verb: 'suggest-policy-tightening', label: 'Suggest Policy Tightening' },
  { verb: 'detect-policy-drift', label: 'Detect Policy Drift' },
  { verb: 'recommend-audit-review', label: 'Recommend Audit Review' },
  { verb: 'generate-compliance-report', label: 'Generate Compliance Report' },
  { verb: 'score-policy-coverage', label: 'Score Policy Coverage' },
];

export default function CuaPolicyGuardPage() {
  return (
    <CuaFeaturePage
      title="CUA Policy Guard"
      slug="cuaPolicyGuard"
      listColumns={LIST_COLS}
      createFields={CREATE_FIELDS}
      aiVerbs={AI_VERBS}
      detailIdField="policyId"
    />
  );
}
