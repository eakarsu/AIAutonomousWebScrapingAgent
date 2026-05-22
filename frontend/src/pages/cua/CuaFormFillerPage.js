import React from 'react';
import CuaFeaturePage from './CuaFeaturePage';

const LIST_COLS = [
  { key: 'id', label: 'ID' },
  { key: 'session_id', label: 'Session ID' },
  { key: 'form_selector', label: 'Form Selector' },
  { key: 'status', label: 'Status' },
  { key: 'field_count', label: '# Fields' },
  { key: 'submit_attempted', label: 'Submitted' },
  { key: 'created_at', label: 'Created' },
];

const CREATE_FIELDS = [
  { name: 'session_id', label: 'Session ID', placeholder: 'Parent session UUID' },
  { name: 'form_selector', label: 'Form Selector', placeholder: '#login-form or form.checkout' },
  { name: 'form_data', label: 'Form Data (JSON)', type: 'textarea', placeholder: '{"username": "user@example.com", "password": "..."}' },
  { name: 'status', label: 'Status', type: 'select', options: ['pending', 'filling', 'completed', 'failed'] },
  { name: 'submit_selector', label: 'Submit Button Selector', placeholder: 'button[type=submit]' },
];

const AI_VERBS = [
  { verb: 'detect-field-type', label: 'Detect Field Type' },
  { verb: 'suggest-field-value', label: 'Suggest Field Value', extraFields: [{ name: 'fieldName', label: 'Field Name', placeholder: 'email, password, address…' }] },
  { verb: 'validate-field-format', label: 'Validate Field Format', extraFields: [{ name: 'fieldValue', label: 'Field Value to Validate', placeholder: 'user@example.com' }] },
  { verb: 'classify-required-field', label: 'Classify Required Fields' },
  { verb: 'predict-validation-error', label: 'Predict Validation Error' },
  { verb: 'recommend-fill-order', label: 'Recommend Fill Order' },
  { verb: 'detect-captcha', label: 'Detect CAPTCHA' },
  { verb: 'suggest-captcha-strategy', label: 'Suggest CAPTCHA Strategy' },
  { verb: 'generate-test-data', label: 'Generate Test Data' },
  { verb: 'score-form-complexity', label: 'Score Form Complexity' },
  { verb: 'validate-cross-field-rules', label: 'Validate Cross-Field Rules' },
  { verb: 'detect-multi-step-form', label: 'Detect Multi-Step Form' },
  { verb: 'classify-form-purpose', label: 'Classify Form Purpose' },
  { verb: 'recommend-skip-field', label: 'Recommend Skip Field' },
  { verb: 'summarize-form-fields', label: 'Summarize Form Fields' },
  { verb: 'predict-submit-success', label: 'Predict Submit Success' },
];

export default function CuaFormFillerPage() {
  return (
    <CuaFeaturePage
      title="Form Filler"
      slug="formFiller"
      listColumns={LIST_COLS}
      createFields={CREATE_FIELDS}
      aiVerbs={AI_VERBS}
      detailIdField="formId"
    />
  );
}
