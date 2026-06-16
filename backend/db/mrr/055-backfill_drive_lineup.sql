-- Backfill: link already DL-validated candidates on walk-in/drive jobs into
-- their drive lineup at the "confirmed" tracker stage. Idempotent — the
-- `drive_id IS NULL` guard makes re-runs a no-op and never clobbers candidates
-- already added to a drive. drive_tracker_stage is stored as the enum value
-- string (column uses native_enum=False), so 'confirmed' is correct.
UPDATE candidates c
SET drive_id = d.id,
    drive_tracker_stage = 'confirmed'
FROM drives d
JOIN jobs j ON j.id = d.job_id
WHERE c.job_id = j.id
  AND c.drive_id IS NULL
  AND c.dl_verified = true
  AND (j.walkin = true OR j.drive = true);
