import React from 'react';
import CuaFeaturePage from './CuaFeaturePage';

const LIST_COLS = [
  { key: 'id', label: 'ID' },
  { key: 'session_id', label: 'Session ID' },
  { key: 'recording_name', label: 'Recording Name' },
  { key: 'status', label: 'Status' },
  { key: 'action_count', label: '# Actions' },
  { key: 'duration_ms', label: 'Duration (ms)' },
  { key: 'created_at', label: 'Created' },
];

const CREATE_FIELDS = [
  { name: 'session_id', label: 'Session ID', placeholder: 'Parent session UUID' },
  { name: 'recording_name', label: 'Recording Name', placeholder: 'Login workflow v1' },
  { name: 'status', label: 'Status', type: 'select', options: ['recording', 'paused', 'completed', 'failed'] },
  { name: 'start_url', label: 'Start URL', placeholder: 'https://example.com' },
  { name: 'notes', label: 'Notes (optional)', type: 'textarea', placeholder: 'Recording notes…' },
];

const AI_VERBS = [
  { verb: 'summarize-session', label: 'Summarize Session' },
  { verb: 'suggest-edit-cuts', label: 'Suggest Edit Cuts' },
  { verb: 'classify-action-significance', label: 'Classify Action Significance' },
  { verb: 'detect-sensitive-action', label: 'Detect Sensitive Action' },
  { verb: 'generate-replay-script', label: 'Generate Replay Script' },
  { verb: 'predict-replay-success', label: 'Predict Replay Success' },
  { verb: 'recommend-checkpoint', label: 'Recommend Checkpoint' },
  { verb: 'score-recording-completeness', label: 'Score Recording Completeness' },
  { verb: 'validate-action-determinism', label: 'Validate Action Determinism' },
  { verb: 'detect-flaky-action', label: 'Detect Flaky Action' },
  { verb: 'suggest-assertion', label: 'Suggest Assertion' },
  { verb: 'classify-failure-cause', label: 'Classify Failure Cause' },
  { verb: 'generate-test-from-recording', label: 'Generate Test from Recording' },
  { verb: 'summarize-coverage', label: 'Summarize Coverage' },
  { verb: 'recommend-record-frequency', label: 'Recommend Record Frequency' },
  { verb: 'detect-recording-drift', label: 'Detect Recording Drift' },
];

export default function CuaSessionRecordingPage() {
  return (
    <CuaFeaturePage
      title="Session Recording"
      slug="sessionRecording"
      listColumns={LIST_COLS}
      createFields={CREATE_FIELDS}
      aiVerbs={AI_VERBS}
      detailIdField="recordingId"
    />
  );
}
