-- Add a single `applied_by` column to candidates capturing the EMAIL of the
-- recruiter who applied this candidate to this candidate's job. With one
-- candidate row per (person × job), this single field is enough — no parallel
-- arrays, no FK changes, no dedup logic. If the same person applies to a
-- different job, that's a new candidate row with its own applied_by.
--
-- The DROPs below clean up an earlier multi-application attempt (job_ids /
-- applied_by_ids arrays) so re-running this file lands at the final shape.

ALTER TABLE candidates DROP COLUMN IF EXISTS job_ids;
ALTER TABLE candidates DROP COLUMN IF EXISTS applied_by_ids;
ALTER TABLE candidates DROP COLUMN IF EXISTS applied_by;

ALTER TABLE candidates ADD COLUMN applied_by TEXT;

-- Backfill: every existing candidate's applied_by becomes the email of the
-- recruiter recorded as having sourced them.
UPDATE candidates c
   SET applied_by = u.email
  FROM users u
 WHERE c.sourced_by_id = u.id
   AND u.email IS NOT NULL
   AND u.email <> ''
   AND c.applied_by IS NULL;
