-- Backfill: all pending_review jobs → open.
-- Jobs always have at least one DL assigned at creation, so pending_review
-- served no functional gate. New jobs are created as open directly.
UPDATE jobs
SET status = 'open'
WHERE status = 'pending_review';
