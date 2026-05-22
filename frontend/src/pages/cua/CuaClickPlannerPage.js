import React from 'react';
import CuaFeaturePage from './CuaFeaturePage';

const LIST_COLS = [
  { key: 'id', label: 'ID' },
  { key: 'session_id', label: 'Session ID' },
  { key: 'target_selector', label: 'Target Selector' },
  { key: 'click_type', label: 'Click Type' },
  { key: 'status', label: 'Status' },
  { key: 'confidence_score', label: 'Confidence' },
  { key: 'created_at', label: 'Created' },
];

const CREATE_FIELDS = [
  { name: 'session_id', label: 'Session ID', placeholder: 'Parent session UUID' },
  { name: 'target_selector', label: 'Target Selector', placeholder: '#submit-btn or .login-form > button' },
  { name: 'click_type', label: 'Click Type', type: 'select', options: ['left', 'right', 'double', 'hover'] },
  { name: 'coordinate_x', label: 'X Coordinate', type: 'number', placeholder: '540' },
  { name: 'coordinate_y', label: 'Y Coordinate', type: 'number', placeholder: '360' },
  { name: 'status', label: 'Status', type: 'select', options: ['pending', 'executed', 'failed', 'skipped'] },
];

const AI_VERBS = [
  { verb: 'predict-click-target', label: 'Predict Click Target' },
  { verb: 'suggest-click-coordinates', label: 'Suggest Click Coordinates' },
  { verb: 'classify-element-type', label: 'Classify Element Type' },
  { verb: 'score-target-confidence', label: 'Score Target Confidence' },
  { verb: 'detect-ambiguous-target', label: 'Detect Ambiguous Target' },
  { verb: 'recommend-disambiguation', label: 'Recommend Disambiguation' },
  { verb: 'generate-xpath', label: 'Generate XPath' },
  { verb: 'validate-target-clickable', label: 'Validate Target Clickable' },
  { verb: 'suggest-alternate-target', label: 'Suggest Alternate Target' },
  { verb: 'predict-misclick-risk', label: 'Predict Misclick Risk' },
  { verb: 'classify-button-purpose', label: 'Classify Button Purpose' },
  { verb: 'detect-dynamic-element', label: 'Detect Dynamic Element' },
  { verb: 'suggest-wait-before-click', label: 'Suggest Wait Before Click' },
  { verb: 'score-target-stability', label: 'Score Target Stability' },
  { verb: 'recommend-target-selector-strategy', label: 'Recommend Selector Strategy' },
  { verb: 'summarize-click-plan', label: 'Summarize Click Plan' },
];

export default function CuaClickPlannerPage() {
  return (
    <CuaFeaturePage
      title="Click Planner"
      slug="clickPlanner"
      listColumns={LIST_COLS}
      createFields={CREATE_FIELDS}
      aiVerbs={AI_VERBS}
      detailIdField="planId"
    />
  );
}
