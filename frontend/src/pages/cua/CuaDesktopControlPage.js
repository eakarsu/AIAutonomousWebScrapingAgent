import React from 'react';
import CuaFeaturePage from './CuaFeaturePage';

const LIST_COLS = [
  { key: 'id', label: 'ID' },
  { key: 'session_name', label: 'Session Name' },
  { key: 'target_app', label: 'Target App' },
  { key: 'status', label: 'Status' },
  { key: 'os_platform', label: 'OS' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'created_at', label: 'Created' },
];

const CREATE_FIELDS = [
  { name: 'session_name', label: 'Session Name', placeholder: 'My Desktop Session' },
  { name: 'target_app', label: 'Target App', placeholder: 'chrome, notepad, …' },
  { name: 'status', label: 'Status', type: 'select', options: ['idle', 'running', 'error', 'completed'] },
  { name: 'os_platform', label: 'OS Platform', type: 'select', options: ['windows', 'macos', 'linux'] },
  { name: 'resolution', label: 'Resolution', placeholder: '1920x1080' },
  { name: 'script_payload', label: 'Script Payload (optional)', type: 'textarea', placeholder: 'Automation script…' },
];

const AI_VERBS = [
  { verb: 'classify-screen-state', label: 'Classify Screen State' },
  { verb: 'suggest-next-action', label: 'Suggest Next Action' },
  { verb: 'predict-action-success', label: 'Predict Action Success' },
  { verb: 'detect-blocker', label: 'Detect Blocker' },
  { verb: 'score-action-risk', label: 'Score Action Risk', extraFields: [{ name: 'action', label: 'Action (JSON string)', placeholder: '{"type":"click","target":"#btn"}' }] },
  { verb: 'recommend-fallback-action', label: 'Recommend Fallback Action' },
  { verb: 'generate-action-script', label: 'Generate Action Script' },
  { verb: 'summarize-session', label: 'Summarize Session' },
  { verb: 'validate-action-feasibility', label: 'Validate Action Feasibility', extraFields: [{ name: 'action', label: 'Action (JSON string)', placeholder: '{"type":"type","value":"hello"}' }] },
  { verb: 'detect-popup', label: 'Detect Popup' },
  { verb: 'classify-app-window', label: 'Classify App Window' },
  { verb: 'suggest-keyboard-shortcut', label: 'Suggest Keyboard Shortcut', extraFields: [{ name: 'intent', label: 'Intent', placeholder: 'save file' }] },
  { verb: 'predict-load-time', label: 'Predict Load Time' },
  { verb: 'recommend-wait-strategy', label: 'Recommend Wait Strategy' },
  { verb: 'detect-error-dialog', label: 'Detect Error Dialog' },
  { verb: 'generate-recovery-plan', label: 'Generate Recovery Plan' },
];

export default function CuaDesktopControlPage() {
  return (
    <CuaFeaturePage
      title="Desktop Session Control"
      slug="desktopControl"
      listColumns={LIST_COLS}
      createFields={CREATE_FIELDS}
      aiVerbs={AI_VERBS}
      detailIdField="sessionId"
    />
  );
}
