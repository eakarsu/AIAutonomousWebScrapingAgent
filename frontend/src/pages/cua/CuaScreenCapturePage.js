import React from 'react';
import CuaFeaturePage from './CuaFeaturePage';

const LIST_COLS = [
  { key: 'id', label: 'ID' },
  { key: 'session_id', label: 'Session ID' },
  { key: 'capture_url', label: 'Capture URL' },
  { key: 'width', label: 'W' },
  { key: 'height', label: 'H' },
  { key: 'storage_tier', label: 'Tier' },
  { key: 'change_detected', label: 'Changed' },
  { key: 'captured_at', label: 'Captured' },
];

const CREATE_FIELDS = [
  { name: 'session_id', label: 'Session ID', placeholder: 'UUID of parent session' },
  { name: 'capture_url', label: 'Capture URL', placeholder: 'https://storage.example.com/screenshot.png' },
  { name: 'thumbnail_url', label: 'Thumbnail URL (optional)', placeholder: 'https://…/thumb.png' },
  { name: 'width', label: 'Width (px)', type: 'number', placeholder: '1920' },
  { name: 'height', label: 'Height (px)', type: 'number', placeholder: '1080' },
  { name: 'file_size_bytes', label: 'File Size (bytes)', type: 'number', placeholder: '204800' },
  { name: 'storage_tier', label: 'Storage Tier', type: 'select', options: ['hot', 'warm', 'cold'] },
];

const AI_VERBS = [
  { verb: 'ocr-extract', label: 'OCR Extract' },
  { verb: 'detect-change', label: 'Detect Change', extraFields: [{ name: 'previousText', label: 'Previous OCR Text', placeholder: 'Previous capture OCR text…' }] },
  { verb: 'classify-screen-content', label: 'Classify Screen Content' },
  { verb: 'summarize-screen', label: 'Summarize Screen' },
  { verb: 'redact-pii', label: 'Redact PII' },
  { verb: 'score-screenshot-quality', label: 'Score Screenshot Quality' },
  { verb: 'detect-sensitive-data', label: 'Detect Sensitive Data' },
  { verb: 'suggest-region-of-interest', label: 'Suggest Region of Interest', extraFields: [{ name: 'goal', label: 'Automation Goal', placeholder: 'Click login button' }] },
  { verb: 'generate-alt-text', label: 'Generate Alt Text' },
  { verb: 'classify-ui-element', label: 'Classify UI Element', extraFields: [{ name: 'elementDescription', label: 'Element Description', placeholder: 'Blue button at top right' }] },
  { verb: 'predict-content-region', label: 'Predict Content Region', extraFields: [{ name: 'contentType', label: 'Content Type', placeholder: 'login form' }] },
  { verb: 'validate-capture-timing', label: 'Validate Capture Timing' },
  { verb: 'detect-loading-state', label: 'Detect Loading State' },
  { verb: 'suggest-capture-cadence', label: 'Suggest Capture Cadence', extraFields: [{ name: 'workflowType', label: 'Workflow Type', placeholder: 'form-fill, navigation, scraping…' }] },
  { verb: 'summarize-diff', label: 'Summarize Diff', extraFields: [{ name: 'previousOcr', label: 'Previous OCR Text', placeholder: 'OCR from prior capture…' }] },
  { verb: 'recommend-storage-tier', label: 'Recommend Storage Tier' },
];

export default function CuaScreenCapturePage() {
  return (
    <CuaFeaturePage
      title="Screen Capture — OCR & Diff"
      slug="screenCapture"
      listColumns={LIST_COLS}
      createFields={CREATE_FIELDS}
      aiVerbs={AI_VERBS}
      detailIdField="captureId"
    />
  );
}
