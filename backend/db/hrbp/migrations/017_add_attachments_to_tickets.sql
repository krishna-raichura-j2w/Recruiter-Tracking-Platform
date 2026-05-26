-- Migration 017: add attachments column to hrbp_tickets
ALTER TABLE hrbp_tickets
    ADD COLUMN IF NOT EXISTS attachments TEXT[] NOT NULL DEFAULT '{}';
