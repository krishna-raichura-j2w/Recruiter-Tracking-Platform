-- Extend the AI scoring tables to also represent Offer-Letter-only subjects
-- (candidates/demands that exist only in the OL replica, not in MRR).
-- Additive only — our own ai_* tables, never touches candidates/jobs.
-- Idempotent.

-- ai_candidate_scores: allow OL-keyed rows
ALTER TABLE ai_candidate_scores ADD COLUMN IF NOT EXISTS source VARCHAR(3) NOT NULL DEFAULT 'mrr';
ALTER TABLE ai_candidate_scores ADD COLUMN IF NOT EXISTS ol_user_id INTEGER;
ALTER TABLE ai_candidate_scores ADD COLUMN IF NOT EXISTS ol_job_posting_id INTEGER;
ALTER TABLE ai_candidate_scores ALTER COLUMN candidate_id DROP NOT NULL;
ALTER TABLE ai_candidate_scores ALTER COLUMN job_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_scores_ol
    ON ai_candidate_scores (ol_user_id, ol_job_posting_id) WHERE source = 'ol';
CREATE INDEX IF NOT EXISTS ix_ai_scores_ol_user ON ai_candidate_scores (ol_user_id);

-- ai_candidate_rejects: allow OL-keyed rows
ALTER TABLE ai_candidate_rejects ADD COLUMN IF NOT EXISTS source VARCHAR(3) NOT NULL DEFAULT 'mrr';
ALTER TABLE ai_candidate_rejects ADD COLUMN IF NOT EXISTS ol_user_id INTEGER;
ALTER TABLE ai_candidate_rejects ADD COLUMN IF NOT EXISTS ol_job_posting_id INTEGER;
ALTER TABLE ai_candidate_rejects ALTER COLUMN candidate_id DROP NOT NULL;
ALTER TABLE ai_candidate_rejects ALTER COLUMN job_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_rejects_ol
    ON ai_candidate_rejects (ol_user_id, ol_job_posting_id) WHERE source = 'ol';

-- ai_jd_rubrics: allow OL-demand rubrics (keyed by ol_job_posting_id)
ALTER TABLE ai_jd_rubrics ADD COLUMN IF NOT EXISTS source VARCHAR(3) NOT NULL DEFAULT 'mrr';
ALTER TABLE ai_jd_rubrics ADD COLUMN IF NOT EXISTS ol_job_posting_id INTEGER;
ALTER TABLE ai_jd_rubrics ALTER COLUMN job_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_rubrics_ol
    ON ai_jd_rubrics (ol_job_posting_id) WHERE source = 'ol';
