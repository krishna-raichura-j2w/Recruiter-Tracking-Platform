-- Add Google Calendar integration fields to hrbp_cadence_schedules
ALTER TABLE hrbp_cadence_schedules
    ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT,
    ADD COLUMN IF NOT EXISTS google_meet_link TEXT;
