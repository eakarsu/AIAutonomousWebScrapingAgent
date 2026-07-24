CREATE TABLE IF NOT EXISTS runtime_ai_results (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  feature VARCHAR(100) NOT NULL,
  input JSONB NOT NULL,
  content TEXT NOT NULL,
  model VARCHAR(255) NOT NULL,
  provider_receipt JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS runtime_ai_results_user_created_idx
  ON runtime_ai_results(user_id, created_at DESC);
