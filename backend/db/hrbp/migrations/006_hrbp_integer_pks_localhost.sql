-- ============================================================
-- MIGRATION: 006_hrbp_integer_pks_localhost.sql
-- Drops all HRBP tables and recreates them with INTEGER PKs.
-- Target: localhost PostgreSQL (users.id is INTEGER here).
-- ============================================================

-- Drop in reverse dependency order
DROP TABLE IF EXISTS hrbp_cadence_sessions      CASCADE;
DROP TABLE IF EXISTS hrbp_cadence_schedules     CASCADE;
DROP TABLE IF EXISTS hrbp_audit_log             CASCADE;
DROP TABLE IF EXISTS hrbp_nps_surveys           CASCADE;
DROP TABLE IF EXISTS hrbp_routine_schedules     CASCADE;
DROP TABLE IF EXISTS hrbp_signals               CASCADE;
DROP TABLE IF EXISTS hrbp_sop_steps             CASCADE;
DROP TABLE IF EXISTS hrbp_emails                CASCADE;
DROP TABLE IF EXISTS hrbp_incidents             CASCADE;
DROP TABLE IF EXISTS hrbp_consultants           CASCADE;
DROP TABLE IF EXISTS hrbp_clients               CASCADE;
DROP TABLE IF EXISTS hrbp_signal_definitions    CASCADE;
DROP TABLE IF EXISTS hrbp_sop_definitions       CASCADE;
DROP TABLE IF EXISTS hrbp_email_templates       CASCADE;
DROP TABLE IF EXISTS hrbp_kra_definitions       CASCADE;

-- ============================================================
-- TABLE: hrbp_kra_definitions
-- ============================================================
CREATE TABLE hrbp_kra_definitions (
    id                  SERIAL PRIMARY KEY,
    kra_code            TEXT UNIQUE NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    what_you_own        TEXT,
    target              TEXT,
    revenue_consequence TEXT,
    control_level       TEXT CHECK (control_level IN ('HIGH', 'LOW')),
    sop_refs            TEXT[],
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_email_templates  (Text PK — named slug)
-- ============================================================
CREATE TABLE hrbp_email_templates (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    group_name      TEXT NOT NULL CHECK (group_name IN ('routine','incident','commercial','medical')),
    channel         TEXT[] NOT NULL,
    subject_tpl     TEXT,
    body_tpl        TEXT NOT NULL,
    required_vars   TEXT[],
    forbidden_words TEXT[],
    locked_cc       TEXT[],
    sop_step_ref    TEXT[],
    kra_ref         TEXT[],
    send_direction  TEXT NOT NULL CHECK (send_direction IN (
                        'hrbp_to_consultant','hrbp_to_bh','hrbp_to_ops_head',
                        'hrbp_to_finance','hrbp_to_family','bh_to_client','finance_to_hospital'
                    )),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_sop_definitions
-- ============================================================
CREATE TABLE hrbp_sop_definitions (
    id                INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    sop_type          TEXT UNIQUE NOT NULL,
    number            TEXT NOT NULL,
    name              TEXT NOT NULL,
    description       TEXT,
    trigger_source    TEXT NOT NULL,
    kra_tags          TEXT[],
    control_level     TEXT NOT NULL CHECK (control_level IN ('HIGH','LOW')),
    email_templates   TEXT[],
    persons_hierarchy JSONB NOT NULL,
    steps_definition  JSONB NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_signal_definitions
-- ============================================================
CREATE TABLE hrbp_signal_definitions (
    id               INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    signal_code      TEXT UNIQUE NOT NULL,
    number           TEXT NOT NULL,
    name             TEXT NOT NULL,
    source           TEXT NOT NULL,
    description      TEXT,
    indicators       TEXT[] NOT NULL,
    auto_action      TEXT,
    auto_sop_trigger TEXT,
    threshold_count  SMALLINT,
    urgency          TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_clients
-- ============================================================
CREATE TABLE hrbp_clients (
    id         INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name       TEXT NOT NULL,
    industry   TEXT,
    bh_id      INTEGER REFERENCES users(id),
    hrbp_id    INTEGER REFERENCES users(id),
    is_active  BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_consultants
-- ============================================================
CREATE TABLE hrbp_consultants (
    id             INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    emp_id         TEXT UNIQUE NOT NULL,
    name           TEXT NOT NULL,
    email          TEXT,
    phone          TEXT,
    client_id      INTEGER NOT NULL REFERENCES hrbp_clients(id),
    hrbp_id        INTEGER NOT NULL REFERENCES users(id),
    manager_name   TEXT,
    modality       TEXT,
    skill          TEXT,
    cohort         TEXT,
    perf_tier      TEXT,
    monthly_po     NUMERIC(12,2),
    monthly_ctc    NUMERIC(12,2),
    po_end_date    DATE,
    join_date      DATE,
    bh_feedback    TEXT,
    nps_score      SMALLINT,
    last_hike_date DATE,
    last_hike_pct  NUMERIC(5,2),
    l_d_status     TEXT,
    is_active      BOOLEAN DEFAULT true,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_incidents
-- ============================================================
CREATE TABLE hrbp_incidents (
    id              INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    ticket_ref      TEXT UNIQUE,
    consultant_id   INTEGER NOT NULL REFERENCES hrbp_consultants(id),
    client_id       INTEGER NOT NULL REFERENCES hrbp_clients(id),
    opened_by       INTEGER NOT NULL REFERENCES users(id),
    sop_type        TEXT NOT NULL REFERENCES hrbp_sop_definitions(sop_type),
    kra_tags        TEXT[],
    risk_level      TEXT CHECK (risk_level IN ('red','amber','green')),
    status          TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','escalated','resolved','closed')),
    current_step    SMALLINT DEFAULT 1,
    description     TEXT,
    source          TEXT CHECK (source IN ('email','manual','signal','scheduler')),
    source_email_id INTEGER,
    opened_at       TIMESTAMPTZ DEFAULT now(),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_emails
-- ============================================================
CREATE TABLE hrbp_emails (
    id              INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    direction       TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
    consultant_id   INTEGER REFERENCES hrbp_consultants(id),
    incident_id     INTEGER REFERENCES hrbp_incidents(id),
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
-- TABLE: hrbp_sop_steps
-- ============================================================
CREATE TABLE hrbp_sop_steps (
    id                INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    incident_id       INTEGER NOT NULL REFERENCES hrbp_incidents(id) ON DELETE CASCADE,
    step_number       SMALLINT NOT NULL,
    action_label      TEXT NOT NULL,
    action_detail     TEXT,
    owner_role        TEXT NOT NULL,
    owner_user_id     INTEGER REFERENCES users(id),
    sla_working_hours SMALLINT NOT NULL,
    due_at            TIMESTAMPTZ,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    escalated_at      TIMESTAMPTZ,
    escalated_to_role TEXT,
    escalated_to_user INTEGER REFERENCES users(id),
    status            TEXT DEFAULT 'pending',
    completion_notes  TEXT,
    completed_by      INTEGER REFERENCES users(id),
    email_template_id TEXT REFERENCES hrbp_email_templates(id),
    hard_gate         TEXT,
    hard_gate_cleared BOOLEAN DEFAULT false,
    kra_ref           TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_signals
-- ============================================================
CREATE TABLE hrbp_signals (
    id            INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    consultant_id INTEGER NOT NULL REFERENCES hrbp_consultants(id),
    logged_by     INTEGER NOT NULL REFERENCES users(id),
    signal_type   TEXT NOT NULL,
    description   TEXT NOT NULL,
    risk_score    SMALLINT,
    action_taken  TEXT,
    incident_id   INTEGER REFERENCES hrbp_incidents(id),
    logged_at     TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_routine_schedules
-- ============================================================
CREATE TABLE hrbp_routine_schedules (
    id                INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    consultant_id     INTEGER NOT NULL REFERENCES hrbp_consultants(id),
    assigned_to       INTEGER NOT NULL REFERENCES users(id),
    task_type         TEXT NOT NULL,
    sop_ref           TEXT,
    kra_ref           TEXT,
    email_template_id TEXT REFERENCES hrbp_email_templates(id),
    due_at            TIMESTAMPTZ NOT NULL,
    completed_at      TIMESTAMPTZ,
    completed_by      INTEGER REFERENCES users(id),
    status            TEXT DEFAULT 'pending',
    recurrence_days   SMALLINT,
    next_due_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_nps_surveys
-- ============================================================
CREATE TABLE hrbp_nps_surveys (
    id               INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    consultant_id    INTEGER NOT NULL REFERENCES hrbp_consultants(id),
    survey_type      TEXT,
    q1_project_score SMALLINT,
    q2_changes       TEXT,
    q3_happiness     SMALLINT,
    q4_help_needed   TEXT,
    q5_open          TEXT,
    dispatched_at    TIMESTAMPTZ DEFAULT now(),
    responded_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_audit_log
-- ============================================================
CREATE TABLE hrbp_audit_log (
    id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    action      TEXT NOT NULL,
    actor_id    INTEGER REFERENCES users(id),
    old_value   JSONB,
    new_value   JSONB,
    ts          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE: hrbp_cadence_schedules
-- ============================================================
CREATE TABLE hrbp_cadence_schedules (
    id                   INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    client_id            INTEGER NOT NULL REFERENCES hrbp_clients(id),
    consultant_id        INTEGER NOT NULL REFERENCES hrbp_consultants(id),
    hrbp_id              INTEGER NOT NULL REFERENCES users(id),
    meeting_type         TEXT NOT NULL CHECK (meeting_type IN ('one_time','recurring')),
    start_date           DATE NOT NULL,
    end_date             DATE,
    frequency_weeks      SMALLINT NOT NULL DEFAULT 1 CHECK (frequency_weeks >= 1),
    status               TEXT NOT NULL DEFAULT 'not_started'
                             CHECK (status IN ('not_started','in_progress','completed','cancelled')),
    supporting_documents TEXT[] DEFAULT '{}',
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_end_date_recurring CHECK (meeting_type = 'one_time' OR end_date IS NOT NULL),
    CONSTRAINT chk_end_date_order     CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_cadence_schedules_client     ON hrbp_cadence_schedules(client_id);
CREATE INDEX IF NOT EXISTS idx_cadence_schedules_consultant ON hrbp_cadence_schedules(consultant_id);
CREATE INDEX IF NOT EXISTS idx_cadence_schedules_hrbp       ON hrbp_cadence_schedules(hrbp_id);
CREATE INDEX IF NOT EXISTS idx_cadence_schedules_status     ON hrbp_cadence_schedules(status);

-- ============================================================
-- TABLE: hrbp_cadence_sessions
-- ============================================================
CREATE TABLE hrbp_cadence_sessions (
    id                   INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    schedule_id          INTEGER NOT NULL REFERENCES hrbp_cadence_schedules(id) ON DELETE CASCADE,
    cadence_number       SMALLINT NOT NULL,
    scheduled_date       DATE NOT NULL,
    status               TEXT NOT NULL DEFAULT 'not_started'
                             CHECK (status IN ('not_started','completed','cancelled')),
    comments             TEXT,
    rca_status           TEXT,
    supporting_documents TEXT[] DEFAULT '{}',
    completed_at         TIMESTAMPTZ,
    completed_by         INTEGER REFERENCES users(id),
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),

    UNIQUE (schedule_id, cadence_number)
);

CREATE INDEX IF NOT EXISTS idx_cadence_sessions_schedule ON hrbp_cadence_sessions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_cadence_sessions_date     ON hrbp_cadence_sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cadence_sessions_status   ON hrbp_cadence_sessions(status);
