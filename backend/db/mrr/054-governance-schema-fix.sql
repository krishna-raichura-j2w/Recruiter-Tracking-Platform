ALTER TABLE hrbp_governance_scores
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS hrbp_governance_custom_categories (
  id               SERIAL PRIMARY KEY,
  consultant_id    INTEGER NOT NULL REFERENCES hrbp_consultants(id) ON DELETE CASCADE,
  key              TEXT    NOT NULL,
  label            TEXT    NOT NULL,
  max_score        INTEGER NOT NULL,
  escalation_base  INTEGER NOT NULL DEFAULT 2,
  description      TEXT    NOT NULL DEFAULT '',
  options          JSONB   NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gov_custom_cat_consultant
  ON hrbp_governance_custom_categories(consultant_id);

CREATE INDEX IF NOT EXISTS idx_gov_scores_consultant_active
  ON hrbp_governance_scores(consultant_id, is_active)
