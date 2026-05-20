-- ============================================================
-- MASTER MIGRATION: 000_create_all_localhost.sql
-- Fresh localhost setup — creates ALL tables with INTEGER PKs.
-- Run once on a clean database.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id                   SERIAL PRIMARY KEY,
    name                 VARCHAR(120) NOT NULL,
    email                VARCHAR(200) UNIQUE NOT NULL,
    password_hash        VARCHAR(256) NOT NULL,
    role                 VARCHAR(30)  NOT NULL,
    secondary_role       VARCHAR(30),
    recruiter_type       VARCHAR(20),
    is_active            BOOLEAN DEFAULT true,
    must_change_password BOOLEAN DEFAULT false,
    pod_lead_id          INTEGER REFERENCES users(id),
    phone                TEXT,
    created_at           TIMESTAMP DEFAULT now(),
    last_login_at        TIMESTAMP,

    CONSTRAINT users_role_check CHECK (
        role IN ('admin','kam','recruiter','delivery_lead','coo','hrbp','bh','ops_head')
    )
);

CREATE TABLE IF NOT EXISTS pod_memberships (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    pod_lead_id INTEGER NOT NULL REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT now(),
    CONSTRAINT uq_pod_membership UNIQUE (user_id, pod_lead_id)
);

CREATE TABLE IF NOT EXISTS account_managers (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    email      VARCHAR(200),
    phone      VARCHAR(30),
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS of_clients (
    id              SERIAL PRIMARY KEY,
    client_id       INTEGER UNIQUE,
    name            VARCHAR(120) UNIQUE NOT NULL,
    short_name      VARCHAR(80),
    website_url     VARCHAR(300),
    logo_data       TEXT,
    description     TEXT,
    created_at      TIMESTAMP DEFAULT now(),
    updated_at      TIMESTAMP DEFAULT now(),
    last_updated_by VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS probing_data (
    id                         SERIAL PRIMARY KEY,
    job_id                     INTEGER,
    reporting_manager_location TEXT,
    onsite_opportunities       TEXT,
    project_size               TEXT,
    project_count              TEXT,
    work_mode                  TEXT,
    candidate_role             TEXT,
    feedback_eta               TEXT,
    work_location              TEXT,
    interview_type             TEXT,
    role_clarity               TEXT,
    notice_period              TEXT,
    interview_rounds_count     TEXT,
    urgency_eta                TEXT,
    skill_type                 TEXT,
    created_by_id              INTEGER REFERENCES users(id),
    email_id                   VARCHAR(200),
    created_at                 TIMESTAMP DEFAULT now(),
    updated_at                 TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
    id                   SERIAL PRIMARY KEY,
    client_id            INTEGER REFERENCES of_clients(client_id),
    client_name          VARCHAR(120) NOT NULL,
    role_title           VARCHAR(200) NOT NULL,
    job_id               INTEGER,
    probing_id           INTEGER REFERENCES probing_data(id),
    client_job_id        VARCHAR(100),
    demand_source        VARCHAR(80),
    demand_type          VARCHAR(50),
    demand_exclusivity   VARCHAR(50),
    skill_stack          TEXT,
    work_mode            VARCHAR(30),
    work_auth            VARCHAR(50),
    headcount            INTEGER DEFAULT 1,
    status               VARCHAR(30) DEFAULT 'open',
    location             VARCHAR(200),
    jd_summary           TEXT,
    jd_parsed            TEXT,
    jd_raw_text          TEXT,
    min_experience       INTEGER,
    max_experience       INTEGER,
    salary_range         VARCHAR(100),
    assigned_sourcer_id  INTEGER REFERENCES users(id),
    assigned_caller_id   INTEGER REFERENCES users(id),
    sourcer_ids          TEXT DEFAULT '[]',
    caller_ids           TEXT DEFAULT '[]',
    sourcing_target      INTEGER,
    kam_id               INTEGER REFERENCES users(id),
    delivery_lead_id     INTEGER REFERENCES users(id),
    delivery_lead_ids    TEXT DEFAULT '[]',
    account_manager_id   INTEGER REFERENCES account_managers(id),
    deadline             TIMESTAMP,
    sourcing_deadline    TIMESTAMP,
    calling_deadline     TIMESTAMP,
    sourcing_warned      BOOLEAN DEFAULT false,
    sourcing_alerted     BOOLEAN DEFAULT false,
    calling_warned       BOOLEAN DEFAULT false,
    calling_alerted      BOOLEAN DEFAULT false,
    created_by_id        INTEGER REFERENCES users(id),
    email_id             VARCHAR(200),
    created_at           TIMESTAMP DEFAULT now(),
    updated_at           TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidates (
    id                   SERIAL PRIMARY KEY,
    job_id               INTEGER NOT NULL REFERENCES jobs(id),
    full_name            VARCHAR(200) NOT NULL,
    mobile               VARCHAR(20),
    email                VARCHAR(200),
    linkedin_url         VARCHAR(300),
    education            VARCHAR(100),
    city                 VARCHAR(100),
    exp_range            VARCHAR(50),
    current_company      VARCHAR(200),
    skills               TEXT,
    naukri_active        VARCHAR(10),
    immediate_joiner     VARCHAR(10),
    lead_source          VARCHAR(100),
    resume_data          TEXT,
    status               VARCHAR(50) DEFAULT 'sourced',
    sourcing_date        VARCHAR(20),
    pool_added_at        VARCHAR(10),
    call_time            VARCHAR(10),
    validation_done_at   VARCHAR(10),
    submission_time_ts   VARCHAR(10),
    feedback_received_at VARCHAR(10),
    sourced_by_id        INTEGER REFERENCES users(id),
    assigned_to_id       INTEGER REFERENCES users(id),
    assigned_validator_id INTEGER REFERENCES users(id),
    sourced_at           TIMESTAMP DEFAULT now(),
    updated_at           TIMESTAMP DEFAULT now(),
    rejection_reason     TEXT,
    rejected_by          VARCHAR(200),
    first_name           VARCHAR(100),
    last_name            VARCHAR(100),
    location             VARCHAR(200),
    contact_phone        VARCHAR(30),
    gender               VARCHAR(20),
    designation          VARCHAR(200),
    employer             VARCHAR(200),
    total_experience     FLOAT,
    min_experience       FLOAT,
    max_experience       FLOAT,
    current_ctc          FLOAT,
    expected_ctc         FLOAT,
    resume               TEXT,
    role_id              INTEGER NOT NULL DEFAULT 4,
    type                 VARCHAR(50) NOT NULL DEFAULT 'UserCandidate'
);

CREATE TABLE IF NOT EXISTS call_logs (
    id            SERIAL PRIMARY KEY,
    candidate_id  INTEGER NOT NULL REFERENCES candidates(id),
    caller_id     INTEGER NOT NULL REFERENCES users(id),
    call_date     TIMESTAMP DEFAULT now(),
    outcome       VARCHAR(50),
    callback_date TIMESTAMP,
    notes         TEXT,
    created_at    TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assessments (
    id                      SERIAL PRIMARY KEY,
    candidate_id            INTEGER UNIQUE NOT NULL REFERENCES candidates(id),
    caller_id               INTEGER NOT NULL REFERENCES users(id),
    full_name_confirmed     VARCHAR(200),
    email_verified          VARCHAR(200),
    alt_phone               VARCHAR(20),
    linkedin_verified       VARCHAR(500),
    total_exp               FLOAT,
    relevant_exp            FLOAT,
    qualification           VARCHAR(100),
    last_company            VARCHAR(200),
    last_tenure             VARCHAR(50),
    tenure_from             VARCHAR(20),
    tenure_to               VARCHAR(20),
    notice_period_weeks     INTEGER,
    lwd_confirmed           VARCHAR(10),
    last_working_day        VARCHAR(20),
    deploying_client        VARCHAR(200),
    role_position           VARCHAR(200),
    primary_skill_stack     TEXT,
    current_ctc             FLOAT,
    expected_ctc            FLOAT,
    hike_pct                FLOAT,
    comm_score              FLOAT,
    self_art_score          FLOAT,
    role_art_score          FLOAT,
    resume_skill_score      FLOAT,
    tech_qa_score           FLOAT,
    paraphrase_score        FLOAT,
    confidence_score        FLOAT,
    gut_score               FLOAT,
    skill_match_last_role   VARCHAR(50),
    tech_q_used             TEXT,
    project_status          TEXT,
    open_to_relocation      VARCHAR(50),
    work_mode_pref          VARCHAR(50),
    work_auth_status        VARCHAR(50),
    current_city            VARCHAR(100),
    reason_for_change       TEXT,
    interviewing_elsewhere  VARCHAR(10),
    offers_in_hand          VARCHAR(10),
    counter_offer_risk      VARCHAR(20),
    last_appraisal_context  TEXT,
    email_acknowledged      VARCHAR(10),
    validation_slot_locked  VARCHAR(10),
    pass_to_validation      VARCHAR(30),
    tech_score              FLOAT,
    soft_skill_score        FLOAT,
    overall_score           FLOAT,
    auto_recommendation     VARCHAR(30),
    red_flags               TEXT,
    caller_notes            TEXT,
    created_at              TIMESTAMP DEFAULT now(),
    updated_at              TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS validations (
    id                  SERIAL PRIMARY KEY,
    candidate_id        INTEGER UNIQUE NOT NULL REFERENCES candidates(id),
    delivery_lead_id    INTEGER NOT NULL REFERENCES users(id),
    status              VARCHAR(30),
    comments            TEXT,
    submitted_to_client VARCHAR(10),
    submission_date     VARCHAR(20),
    created_at          TIMESTAMP DEFAULT now(),
    updated_at          TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consultant_profiles (
    id                        SERIAL PRIMARY KEY,
    candidate_id              INTEGER UNIQUE NOT NULL REFERENCES candidates(id),
    resignation_acceptance    VARCHAR(10),
    replacement_kt_status     VARCHAR(100),
    personal_laptop           VARCHAR(10),
    role_responsibilities     TEXT,
    current_work_location     VARCHAR(100),
    client_work_location      VARCHAR(100),
    current_work_timings      VARCHAR(50),
    notice_negotiable_upto    VARCHAR(30),
    payroll                   VARCHAR(100),
    offers_pipeline           VARCHAR(10),
    interview_pipeline        VARCHAR(10),
    dob                       VARCHAR(20),
    telephonic_availability   VARCHAR(10),
    ide_installed             VARCHAR(10),
    wifi_connectivity         VARCHAR(10),
    marital_status            VARCHAR(30),
    health_issues             TEXT,
    planned_leaves            TEXT,
    interview_availability_2d VARCHAR(10),
    upcoming_travel           TEXT,
    updated_at                TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
    id                     SERIAL PRIMARY KEY,
    candidate_id           INTEGER UNIQUE NOT NULL REFERENCES candidates(id),
    job_id                 INTEGER NOT NULL REFERENCES jobs(id),
    delivery_lead_id       INTEGER NOT NULL REFERENCES users(id),
    submitted_at           TIMESTAMP DEFAULT now(),
    current_stage          VARCHAR(60) DEFAULT 'submitted',
    ta_feedback            VARCHAR(30),
    hm_feedback            VARCHAR(30),
    tat_window             VARCHAR(20),
    l1_date                VARCHAR(30),
    l1_feedback            VARCHAR(30),
    l1_briefing_done       BOOLEAN DEFAULT false,
    l2_date                VARCHAR(30),
    l2_feedback            VARCHAR(30),
    l2_briefing_done       BOOLEAN DEFAULT false,
    final_date             VARCHAR(30),
    final_feedback         VARCHAR(30),
    final_briefing_done    BOOLEAN DEFAULT false,
    offered_ctc            FLOAT,
    offer_date             VARCHAR(20),
    joining_date_confirmed VARCHAR(20),
    actual_joining_date    VARCHAR(20),
    other_offers_count     VARCHAR(10),
    counter_offer_risk     VARCHAR(20),
    last_notes             TEXT,
    next_action            TEXT,
    next_action_date       VARCHAR(20),
    updated_at             TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submission_timeline (
    id             SERIAL PRIMARY KEY,
    submission_id  INTEGER NOT NULL REFERENCES submissions(id),
    stage          VARCHAR(60) NOT NULL,
    stage_label    VARCHAR(120),
    interview_date VARCHAR(30),
    feedback       VARCHAR(30),
    note           TEXT,
    updated_by_id  INTEGER REFERENCES users(id),
    created_at     TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    message    TEXT NOT NULL,
    notif_type VARCHAR(50) DEFAULT 'general',
    is_read    BOOLEAN DEFAULT false,
    entity_id  INTEGER,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consultant_mails (
    id                       SERIAL PRIMARY KEY,
    candidate_id             INTEGER UNIQUE REFERENCES candidates(id),
    sent_by_id               INTEGER REFERENCES users(id),
    sent_at                  TIMESTAMP DEFAULT now(),
    exit_date                VARCHAR(20),
    acknowledgement_received BOOLEAN DEFAULT false,
    acknowledgement_at       TIMESTAMP,
    dl_verified              BOOLEAN DEFAULT false,
    dl_verified_at           TIMESTAMP,
    exit_proof               TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    action      VARCHAR(100),
    entity_type VARCHAR(100),
    entity_id   INTEGER,
    detail      TEXT,
    created_at  TIMESTAMP DEFAULT now()
);

-- ============================================================
-- HRBP TABLES (all INTEGER PKs)
-- ============================================================

CREATE TABLE IF NOT EXISTS hrbp_kra_definitions (
    id                  SERIAL PRIMARY KEY,
    kra_code            TEXT UNIQUE NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    what_you_own        TEXT,
    target              TEXT,
    revenue_consequence TEXT,
    control_level       TEXT CHECK (control_level IN ('HIGH','LOW')),
    sop_refs            TEXT[],
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hrbp_email_templates (
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

CREATE TABLE IF NOT EXISTS hrbp_sop_definitions (
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

CREATE TABLE IF NOT EXISTS hrbp_signal_definitions (
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

CREATE TABLE IF NOT EXISTS hrbp_clients (
    id         INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name       TEXT NOT NULL,
    industry   TEXT,
    bh_id      INTEGER REFERENCES users(id),
    hrbp_id    INTEGER REFERENCES users(id),
    is_active  BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hrbp_consultants (
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

CREATE TABLE IF NOT EXISTS hrbp_incidents (
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

CREATE TABLE IF NOT EXISTS hrbp_emails (
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

CREATE TABLE IF NOT EXISTS hrbp_sop_steps (
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

CREATE TABLE IF NOT EXISTS hrbp_signals (
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

CREATE TABLE IF NOT EXISTS hrbp_routine_schedules (
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

CREATE TABLE IF NOT EXISTS hrbp_nps_surveys (
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

CREATE TABLE IF NOT EXISTS hrbp_audit_log (
    id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    action      TEXT NOT NULL,
    actor_id    INTEGER REFERENCES users(id),
    old_value   JSONB,
    new_value   JSONB,
    ts          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hrbp_cadence_schedules (
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

CREATE TABLE IF NOT EXISTS hrbp_cadence_sessions (
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
