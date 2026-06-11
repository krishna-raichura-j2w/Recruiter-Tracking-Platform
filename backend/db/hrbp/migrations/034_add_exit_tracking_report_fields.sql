-- Migration 034: Add monthly report fields to hrbp_exit_tracking
--
-- Adds:
--   last_working_day   DATE        — the consultant's actual last day (LWD in the report)
--   hr_efforts         TEXT        — HR remarks / actions taken (HR Efforts column)
--   retained_at        TIMESTAMPTZ — when the retention was confirmed (for month filtering)
--   retention_reason   TEXT        — what action saved the consultant (hike, role change, etc.)
--
-- Also broadens status to accept 'retention_in_progress' and 'retained'
-- (the column is plain TEXT so no constraint to modify)

ALTER TABLE hrbp_exit_tracking
  ADD COLUMN IF NOT EXISTS last_working_day  DATE,
  ADD COLUMN IF NOT EXISTS hr_efforts        TEXT,
  ADD COLUMN IF NOT EXISTS retained_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_reason  TEXT;

-- Back-fill last_working_day from existing exit_date so old records work in reports
UPDATE hrbp_exit_tracking
SET last_working_day = exit_date
WHERE last_working_day IS NULL AND exit_date IS NOT NULL;
