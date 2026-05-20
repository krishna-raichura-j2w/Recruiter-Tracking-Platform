-- ============================================================
-- MIGRATION: 001_create_hrbp_metadata_tables.sql
-- Run this first — no dependencies on other tables
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE 1: hrbp_kra_definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_kra_definitions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kra_code             TEXT UNIQUE NOT NULL,
    name                 TEXT NOT NULL,
    description          TEXT,
    what_you_own         TEXT,
    target               TEXT,
    revenue_consequence  TEXT,
    control_level        TEXT CHECK (control_level IN ('HIGH', 'LOW')),
    sop_refs             TEXT[],
    created_at           TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 2: hrbp_email_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_email_templates (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    group_name       TEXT NOT NULL CHECK (group_name IN (
                         'routine', 'incident', 'commercial', 'medical'
                     )),
    channel          TEXT[] NOT NULL,
    subject_tpl      TEXT,
    body_tpl         TEXT NOT NULL,
    required_vars    TEXT[],
    forbidden_words  TEXT[],
    locked_cc        TEXT[],
    sop_step_ref     TEXT[],
    kra_ref          TEXT[],
    send_direction   TEXT NOT NULL CHECK (send_direction IN (
                         'hrbp_to_consultant',
                         'hrbp_to_bh',
                         'hrbp_to_ops_head',
                         'hrbp_to_finance',
                         'hrbp_to_family',
                         'bh_to_client',
                         'finance_to_hospital'
                     )),
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 3: hrbp_sop_definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_sop_definitions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sop_type           TEXT UNIQUE NOT NULL,
    number             TEXT NOT NULL,
    name               TEXT NOT NULL,
    description        TEXT,
    trigger_source     TEXT NOT NULL,
    kra_tags           TEXT[],
    control_level      TEXT NOT NULL CHECK (control_level IN ('HIGH', 'MEDIUM', 'LOW')),
    email_templates    TEXT[],
    persons_hierarchy  JSONB NOT NULL,
    steps_definition   JSONB NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 4: hrbp_signal_definitions
-- Note: auto_sop_trigger is TEXT not FK to avoid circular deps
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_signal_definitions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_code          TEXT UNIQUE NOT NULL,
    number               TEXT NOT NULL,
    name                 TEXT NOT NULL,
    source               TEXT NOT NULL,
    description          TEXT,
    indicators           TEXT[] NOT NULL,
    auto_action          TEXT,
    auto_sop_trigger     TEXT,
    threshold_count      SMALLINT,
    urgency              TEXT CHECK (urgency IN ('immediate', 'same_day', 'monitor')),
    created_at           TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 5: hrbp_clients
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_clients (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    industry    TEXT,
    bh_id       UUID REFERENCES users(id),
    hrbp_id     UUID REFERENCES users(id),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 6: hrbp_consultants
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_consultants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    emp_id          TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    client_id       UUID NOT NULL REFERENCES hrbp_clients(id),
    hrbp_id         UUID NOT NULL REFERENCES users(id),
    manager_name    TEXT,
    modality        TEXT,
    skill           TEXT,
    cohort          TEXT CHECK (cohort IN (
                        'star','high_performer','rising','bedrock',
                        'new_joiner','watch_exit','watch_rate_rev',
                        'watch_general','rescue'
                    )),
    perf_tier       TEXT CHECK (perf_tier IN (
                        'top_20','mid_60','bottom_20','unrated'
                    )),
    monthly_po      NUMERIC(12,2),
    monthly_ctc     NUMERIC(12,2),
    po_end_date     DATE,
    join_date       DATE,
    bh_feedback     TEXT CHECK (bh_feedback IN (
                        'great','good','mediocre','bad','not_given'
                    )),
    nps_score       SMALLINT CHECK (nps_score BETWEEN 1 AND 10),
    last_hike_date  DATE,
    last_hike_pct   NUMERIC(5,2),
    l_d_status      TEXT CHECK (l_d_status IN (
                        'enrolled','not_started','completed','pending'
                    )),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 7: hrbp_incidents
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_incidents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_ref      TEXT UNIQUE,
    consultant_id   UUID NOT NULL REFERENCES hrbp_consultants(id),
    client_id       UUID NOT NULL REFERENCES hrbp_clients(id),
    opened_by       UUID NOT NULL REFERENCES users(id),
    sop_type        TEXT NOT NULL REFERENCES hrbp_sop_definitions(sop_type),
    kra_tags        TEXT[],
    risk_level      TEXT CHECK (risk_level IN ('red','amber','green')),
    status          TEXT DEFAULT 'open' CHECK (status IN (
                        'open','in_progress','escalated','resolved','closed'
                    )),
    current_step    SMALLINT DEFAULT 1,
    description     TEXT,
    source          TEXT CHECK (source IN (
                        'email','manual','signal','scheduler'
                    )),
    source_email_id UUID,
    opened_at       TIMESTAMPTZ DEFAULT now(),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Auto ticket reference
CREATE SEQUENCE IF NOT EXISTS hrbp_ticket_seq START 1;
CREATE OR REPLACE FUNCTION set_hrbp_ticket_ref()
RETURNS TRIGGER AS $$
BEGIN
    NEW.ticket_ref := 'TKT-' || LPAD(nextval('hrbp_ticket_seq')::TEXT, 3, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hrbp_ticket_ref
BEFORE INSERT ON hrbp_incidents
FOR EACH ROW WHEN (NEW.ticket_ref IS NULL)
EXECUTE FUNCTION set_hrbp_ticket_ref();

-- ============================================================
-- TABLE 8: hrbp_sop_steps
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_sop_steps (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id         UUID NOT NULL REFERENCES hrbp_incidents(id) ON DELETE CASCADE,
    step_number         SMALLINT NOT NULL,
    action_label        TEXT NOT NULL,
    action_detail       TEXT,
    owner_role          TEXT NOT NULL,
    owner_user_id       UUID REFERENCES users(id),
    sla_working_hours   SMALLINT NOT NULL,
    due_at              TIMESTAMPTZ,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    escalated_at        TIMESTAMPTZ,
    escalated_to_role   TEXT,
    escalated_to_user   UUID REFERENCES users(id),
    status              TEXT DEFAULT 'pending' CHECK (status IN (
                            'pending','active','done',
                            'overdue','escalated','skipped'
                        )),
    completion_notes    TEXT,
    completed_by        UUID REFERENCES users(id),
    email_template_id   TEXT REFERENCES hrbp_email_templates(id),
    hard_gate           TEXT,
    hard_gate_cleared   BOOLEAN DEFAULT false,
    kra_ref             TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE (incident_id, step_number)
);

-- ============================================================
-- TABLE 9: hrbp_emails
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_emails (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    direction       TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
    consultant_id   UUID REFERENCES hrbp_consultants(id),
    incident_id     UUID REFERENCES hrbp_incidents(id),
    from_address    TEXT NOT NULL,
    to_addresses    TEXT[] NOT NULL,
    cc_addresses    TEXT[],
    subject         TEXT,
    body_raw        TEXT,
    body_parsed     TEXT,
    template_id     TEXT REFERENCES hrbp_email_templates(id),
    intent          TEXT,
    sop_type_mapped TEXT,
    sent_at         TIMESTAMPTZ,
    received_at     TIMESTAMPTZ,
    processed       BOOLEAN DEFAULT false,
    outlook_msg_id  TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 10: hrbp_signals
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_signals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id   UUID NOT NULL REFERENCES hrbp_consultants(id),
    logged_by       UUID NOT NULL REFERENCES users(id),
    signal_type     TEXT NOT NULL CHECK (signal_type IN (
                        's2_performance','s3_bh_feedback','s4_behaviour',
                        's5_upsell','s6_resignation','s7_conversion'
                    )),
    description     TEXT NOT NULL,
    risk_score      SMALLINT CHECK (risk_score BETWEEN 1 AND 5),
    action_taken    TEXT,
    incident_id     UUID REFERENCES hrbp_incidents(id),
    logged_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 11: hrbp_routine_schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_routine_schedules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id       UUID NOT NULL REFERENCES hrbp_consultants(id),
    assigned_to         UUID NOT NULL REFERENCES users(id),
    task_type           TEXT NOT NULL CHECK (task_type IN (
                            'day1_intro','day15_connect','day45_lock',
                            'day60_tier','day90_review','biweekly_checkin',
                            'monthly_bh_call','monthly_nps',
                            'quarterly_deep_dive','hike_flag',
                            'contract_flag','nps_action'
                        )),
    sop_ref             TEXT,
    kra_ref             TEXT,
    email_template_id   TEXT REFERENCES hrbp_email_templates(id),
    due_at              TIMESTAMPTZ NOT NULL,
    completed_at        TIMESTAMPTZ,
    completed_by        UUID REFERENCES users(id),
    status              TEXT DEFAULT 'pending' CHECK (status IN (
                            'pending','done','overdue','skipped'
                        )),
    recurrence_days     SMALLINT,
    next_due_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 12: hrbp_nps_surveys
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_nps_surveys (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id       UUID NOT NULL REFERENCES hrbp_consultants(id),
    survey_type         TEXT CHECK (survey_type IN (
                            'monthly_pulse','quarterly_deep_dive'
                        )),
    q1_project_score    SMALLINT CHECK (q1_project_score BETWEEN 1 AND 5),
    q2_changes          TEXT,
    q3_happiness        SMALLINT CHECK (q3_happiness BETWEEN 1 AND 10),
    q4_help_needed      TEXT,
    q5_open             TEXT,
    dispatched_at       TIMESTAMPTZ DEFAULT now(),
    responded_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 13: hrbp_audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id   UUID NOT NULL,
    action      TEXT NOT NULL,
    actor_id    UUID REFERENCES users(id),
    old_value   JSONB,
    new_value   JSONB,
    ts          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_hrbp_consultants_client
    ON hrbp_consultants(client_id);
CREATE INDEX idx_hrbp_consultants_hrbp
    ON hrbp_consultants(hrbp_id);
CREATE INDEX idx_hrbp_consultants_cohort
    ON hrbp_consultants(cohort);
CREATE INDEX idx_hrbp_incidents_consultant
    ON hrbp_incidents(consultant_id);
CREATE INDEX idx_hrbp_incidents_status
    ON hrbp_incidents(status);
CREATE INDEX idx_hrbp_sop_steps_status_due
    ON hrbp_sop_steps(status, due_at)
    WHERE status = 'active';
CREATE INDEX idx_hrbp_emails_incident
    ON hrbp_emails(incident_id);
CREATE INDEX idx_hrbp_signals_consultant
    ON hrbp_signals(consultant_id);
CREATE INDEX idx_hrbp_routine_due
    ON hrbp_routine_schedules(due_at, status)
    WHERE status = 'pending';
CREATE INDEX idx_hrbp_audit_entity
    ON hrbp_audit_log(entity_type, entity_id);