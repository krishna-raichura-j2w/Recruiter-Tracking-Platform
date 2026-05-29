-- Add hrbp_ids array column to hrbp_clients
-- Allows multiple HRBPs to be assigned to a single client.
-- If hrbp_ids is empty, fall back to the existing hrbp_id column.

ALTER TABLE hrbp_clients
    ADD COLUMN IF NOT EXISTS hrbp_ids INTEGER[] NOT NULL DEFAULT '{}';
