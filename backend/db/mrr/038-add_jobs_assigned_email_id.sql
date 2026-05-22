-- Add `assigned_email_id`: a PG array of every email tied to a job through
-- ANY of its user-id columns (delivery_lead_id, delivery_lead_ids,
-- sourcer_ids, caller_ids, assigned_sourcer_id, assigned_caller_id, kam_id,
-- account_manager_id, created_by_id).
--
-- The column is kept in sync by SQLAlchemy `before_insert` / `before_update`
-- events on the Job model (see infra/models.py). Backfill for existing rows
-- happens in ensure_schema() at startup.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_email_id TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS ix_jobs_assigned_email_id_gin ON jobs USING GIN (assigned_email_id);
