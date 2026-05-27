-- Migration 019: per-step SLA extension support
-- Adds step_sla_extended_until so admins / escalation managers can push out
-- the step-level SLA deadline without touching step_started_at.

ALTER TABLE hrbp_tickets
    ADD COLUMN IF NOT EXISTS step_sla_extended_until TIMESTAMPTZ;
