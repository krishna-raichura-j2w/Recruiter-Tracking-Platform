-- Migration: add meeting_time and duration_minutes to hrbp_cadence_schedules
ALTER TABLE hrbp_cadence_schedules
    ADD COLUMN IF NOT EXISTS meeting_time     TIME,
    ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT DEFAULT 30;
