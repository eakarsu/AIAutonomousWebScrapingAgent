/**
 * models/cua.js — Computer-Use Agent (CUA) platform tables
 * 8 Sequelize-style models implemented as raw pg DDL helpers.
 * Call setupCuaTables(pool) at startup to create tables if absent.
 */

const CUA_DDL = `
-- 1. desktop_control_sessions
CREATE TABLE IF NOT EXISTS cua_desktop_sessions (
  id              SERIAL PRIMARY KEY,
  session_name    VARCHAR(255) NOT NULL,
  target_app      VARCHAR(255),
  status          VARCHAR(50) DEFAULT 'idle',
  os_platform     VARCHAR(100),
  resolution      VARCHAR(50),
  mouse_x         INTEGER DEFAULT 0,
  mouse_y         INTEGER DEFAULT 0,
  last_action     TEXT,
  last_action_at  TIMESTAMP,
  action_log      JSONB DEFAULT '[]',
  script_payload  TEXT,
  error_state     TEXT,
  recovery_plan   TEXT,
  ai_screen_class TEXT,
  ai_risk_score   FLOAT,
  ai_next_action  TEXT,
  archived        BOOLEAN DEFAULT FALSE,
  created_by      INTEGER,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- 2. screen_captures
CREATE TABLE IF NOT EXISTS cua_screen_captures (
  id              SERIAL PRIMARY KEY,
  session_id      INTEGER,
  capture_url     TEXT,
  thumbnail_url   TEXT,
  width           INTEGER,
  height          INTEGER,
  file_size_bytes INTEGER,
  captured_at     TIMESTAMP DEFAULT NOW(),
  ocr_text        TEXT,
  diff_score      FLOAT,
  change_detected BOOLEAN DEFAULT FALSE,
  content_class   TEXT,
  pii_redacted    BOOLEAN DEFAULT FALSE,
  quality_score   FLOAT,
  region_of_interest JSONB,
  loading_state   VARCHAR(50),
  storage_tier    VARCHAR(50) DEFAULT 'hot',
  ai_alt_text     TEXT,
  archived        BOOLEAN DEFAULT FALSE,
  created_by      INTEGER,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- 3. click_plans
CREATE TABLE IF NOT EXISTS cua_click_plans (
  id                  SERIAL PRIMARY KEY,
  session_id          INTEGER,
  capture_id          INTEGER,
  target_description  TEXT,
  predicted_x         INTEGER,
  predicted_y         INTEGER,
  element_type        VARCHAR(100),
  confidence_score    FLOAT,
  xpath_selector      TEXT,
  css_selector        TEXT,
  wait_strategy       TEXT,
  misclick_risk       FLOAT,
  target_stability    FLOAT,
  button_purpose      VARCHAR(100),
  is_dynamic          BOOLEAN DEFAULT FALSE,
  is_ambiguous        BOOLEAN DEFAULT FALSE,
  disambiguation_hint TEXT,
  alternate_target    TEXT,
  selector_strategy   TEXT,
  status              VARCHAR(50) DEFAULT 'pending',
  archived            BOOLEAN DEFAULT FALSE,
  created_by          INTEGER,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- 4. form_fills
CREATE TABLE IF NOT EXISTS cua_form_fills (
  id                SERIAL PRIMARY KEY,
  session_id        INTEGER,
  capture_id        INTEGER,
  form_url          TEXT,
  form_purpose      VARCHAR(100),
  fields_detected   JSONB DEFAULT '[]',
  fill_order        JSONB DEFAULT '[]',
  filled_values     JSONB DEFAULT '{}',
  validation_errors JSONB DEFAULT '[]',
  captcha_detected  BOOLEAN DEFAULT FALSE,
  captcha_strategy  TEXT,
  is_multi_step     BOOLEAN DEFAULT FALSE,
  step_current      INTEGER DEFAULT 1,
  step_total        INTEGER DEFAULT 1,
  complexity_score  FLOAT,
  submit_success    BOOLEAN,
  submit_at         TIMESTAMP,
  test_data         JSONB,
  ai_fill_notes     TEXT,
  archived          BOOLEAN DEFAULT FALSE,
  created_by        INTEGER,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- 5. tab_orchestrations
CREATE TABLE IF NOT EXISTS cua_tab_orchestrations (
  id              SERIAL PRIMARY KEY,
  session_id      INTEGER,
  tab_id          VARCHAR(255),
  window_id       VARCHAR(255),
  tab_purpose     VARCHAR(100),
  tab_url         TEXT,
  tab_title       TEXT,
  is_focused      BOOLEAN DEFAULT FALSE,
  tab_group       VARCHAR(100),
  relevance_score FLOAT,
  context_data    JSONB DEFAULT '{}',
  load_predicted  FLOAT,
  is_leaked       BOOLEAN DEFAULT FALSE,
  deadlock_risk   BOOLEAN DEFAULT FALSE,
  context_isolated BOOLEAN DEFAULT TRUE,
  is_window       BOOLEAN DEFAULT FALSE,
  priority_rank   INTEGER,
  health_score    FLOAT,
  ai_tab_summary  TEXT,
  archived        BOOLEAN DEFAULT FALSE,
  created_by      INTEGER,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- 6. session_recordings
CREATE TABLE IF NOT EXISTS cua_session_recordings (
  id                  SERIAL PRIMARY KEY,
  session_id          INTEGER,
  recording_name      VARCHAR(255),
  actions             JSONB DEFAULT '[]',
  checkpoints         JSONB DEFAULT '[]',
  assertions          JSONB DEFAULT '[]',
  duration_ms         INTEGER,
  action_count        INTEGER DEFAULT 0,
  flaky_actions       JSONB DEFAULT '[]',
  sensitive_actions   JSONB DEFAULT '[]',
  completeness_score  FLOAT,
  replay_script       TEXT,
  test_script         TEXT,
  coverage_summary    TEXT,
  failure_cause       TEXT,
  drift_detected      BOOLEAN DEFAULT FALSE,
  status              VARCHAR(50) DEFAULT 'recording',
  export_url          TEXT,
  archived            BOOLEAN DEFAULT FALSE,
  created_by          INTEGER,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- 7. human_handoffs
CREATE TABLE IF NOT EXISTS cua_human_handoffs (
  id                  SERIAL PRIMARY KEY,
  session_id          INTEGER,
  recording_id        INTEGER,
  handoff_reason      VARCHAR(255),
  urgency_score       FLOAT,
  status              VARCHAR(50) DEFAULT 'queued',
  assigned_to         VARCHAR(255),
  context_payload     JSONB DEFAULT '{}',
  handoff_summary     TEXT,
  human_actions       JSONB DEFAULT '[]',
  resolution_notes    TEXT,
  return_to_bot_ready BOOLEAN DEFAULT FALSE,
  resolution_time_ms  INTEGER,
  predicted_resolve   FLOAT,
  coach_feedback      TEXT,
  quality_score       FLOAT,
  is_low_value        BOOLEAN DEFAULT FALSE,
  prevention_hint     TEXT,
  archived            BOOLEAN DEFAULT FALSE,
  created_by          INTEGER,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- 8. policy_guard_entries
CREATE TABLE IF NOT EXISTS cua_policy_guard (
  id               SERIAL PRIMARY KEY,
  session_id       INTEGER,
  action_type      VARCHAR(100),
  action_payload   JSONB DEFAULT '{}',
  policy_decision  VARCHAR(50) DEFAULT 'allow',
  violation_type   VARCHAR(100),
  risk_score       FLOAT,
  pii_detected     BOOLEAN DEFAULT FALSE,
  pii_redacted_payload JSONB,
  policy_rule_id   VARCHAR(100),
  policy_name      TEXT,
  explanation      TEXT,
  audit_event      TEXT,
  compliance_flags JSONB DEFAULT '[]',
  drift_detected   BOOLEAN DEFAULT FALSE,
  coverage_score   FLOAT,
  reviewed_at      TIMESTAMP,
  reviewed_by      VARCHAR(255),
  archived         BOOLEAN DEFAULT FALSE,
  created_by       INTEGER,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);
`;

async function setupCuaTables(pool) {
  try {
    const statements = CUA_DDL.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log('[CUA] Tables ready.');
  } catch (err) {
    console.error('[CUA] Table setup error:', err.message);
  }
}

module.exports = { setupCuaTables };
