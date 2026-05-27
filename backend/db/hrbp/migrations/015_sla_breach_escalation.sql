-- Migration 015: SLA breach escalation support
-- Adds sla_alerted_at to prevent duplicate breach alerts,
-- and documents the new "escalated" ticket status (stored as text, no constraint).

ALTER TABLE hrbp_tickets
    ADD COLUMN IF NOT EXISTS sla_alerted_at TIMESTAMPTZ;
