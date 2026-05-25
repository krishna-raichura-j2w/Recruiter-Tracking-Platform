-- Migration: 010_add_bh_id_to_cadence_schedules.sql
-- Adds an optional BH tag to cadence schedules.
-- When set, the BH can see this cadence labelled "My Cadence";
-- untagged cadences visible to a BH are labelled "Team Cadence".
ALTER TABLE hrbp_cadence_schedules
    ADD COLUMN IF NOT EXISTS bh_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_cadence_schedules_bh
    ON hrbp_cadence_schedules(bh_id);
