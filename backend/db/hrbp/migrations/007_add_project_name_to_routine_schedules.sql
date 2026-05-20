-- Migration: add project_name to hrbp_cadence_schedules
ALTER TABLE hrbp_cadence_schedules
    ADD COLUMN IF NOT EXISTS project_name TEXT;
