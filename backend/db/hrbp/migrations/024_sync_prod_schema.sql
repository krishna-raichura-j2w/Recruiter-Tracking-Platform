-- ============================================================
-- MIGRATION 024: sync_prod_schema
-- Idempotent catch-all that applies every column/table added
-- in migrations 007–023 which may not have been run on prod.
-- Safe to run multiple times (all ADD COLUMN use IF NOT EXISTS,
-- all CREATE TABLE use IF NOT EXISTS).
-- ============================================================

-- ── hrbp_clients (009) ───────────────────────────────────────
ALTER TABLE hrbp_clients
    ADD COLUMN IF NOT EXISTS headcount INTEGER DEFAULT 0;

-- ── hrbp_cadence_schedules (007, 008, 010) ───────────────────
ALTER TABLE hrbp_cadence_schedules
    ADD COLUMN IF NOT EXISTS project_name    TEXT,
    ADD COLUMN IF NOT EXISTS meeting_time    TIME,
    ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT DEFAULT 30,
    ADD COLUMN IF NOT EXISTS bh_id           INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_cadence_schedules_bh ON hrbp_cadence_schedules(bh_id);

-- ── hrbp_consultants (012) ───────────────────────────────────
ALTER TABLE hrbp_consultants
    ADD COLUMN IF NOT EXISTS po_risk NUMERIC(14, 2);

-- ── Tickets module — tables (011) ────────────────────────────
CREATE SEQUENCE IF NOT EXISTS hrbp_ticket_seq START 1;

CREATE TABLE IF NOT EXISTS hrbp_tickets (
    id                  SERIAL PRIMARY KEY,
    ticket_number       TEXT UNIQUE NOT NULL,
    title               TEXT NOT NULL,
    raised_by_id        INTEGER NOT NULL REFERENCES users(id),
    escalation_mgr_id   INTEGER REFERENCES users(id),
    client_id           INTEGER NOT NULL REFERENCES hrbp_clients(id),
    sop_id              INTEGER REFERENCES hrbp_sop_definitions(id),
    priority            TEXT NOT NULL DEFAULT 'medium',
    sla_deadline        TIMESTAMPTZ,
    description         TEXT,
    po_risk_amount      NUMERIC(14, 2),
    status              TEXT NOT NULL DEFAULT 'open',
    hierarchy_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_step        SMALLINT NOT NULL DEFAULT 1,
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrbp_tickets_raised_by ON hrbp_tickets(raised_by_id);
CREATE INDEX IF NOT EXISTS idx_hrbp_tickets_client    ON hrbp_tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_hrbp_tickets_status    ON hrbp_tickets(status);
CREATE INDEX IF NOT EXISTS idx_hrbp_tickets_priority  ON hrbp_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_hrbp_tickets_sop       ON hrbp_tickets(sop_id);

CREATE TABLE IF NOT EXISTS hrbp_ticket_consultants (
    ticket_id     INTEGER NOT NULL REFERENCES hrbp_tickets(id) ON DELETE CASCADE,
    consultant_id INTEGER NOT NULL REFERENCES hrbp_consultants(id),
    PRIMARY KEY (ticket_id, consultant_id)
);

CREATE TABLE IF NOT EXISTS hrbp_ticket_comments (
    id             SERIAL PRIMARY KEY,
    ticket_id      INTEGER NOT NULL REFERENCES hrbp_tickets(id) ON DELETE CASCADE,
    author_id      INTEGER NOT NULL REFERENCES users(id),
    hierarchy_step SMALLINT NOT NULL,
    content        TEXT NOT NULL,
    is_resolution  BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrbp_ticket_comments_ticket ON hrbp_ticket_comments(ticket_id);

CREATE TABLE IF NOT EXISTS hrbp_ticket_activity_log (
    id         SERIAL PRIMARY KEY,
    ticket_id  INTEGER NOT NULL REFERENCES hrbp_tickets(id) ON DELETE CASCADE,
    actor_id   INTEGER REFERENCES users(id),
    action     TEXT NOT NULL,
    metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrbp_ticket_activity_ticket ON hrbp_ticket_activity_log(ticket_id);

-- ── hrbp_user_pinned_tickets (014) ───────────────────────────
CREATE TABLE IF NOT EXISTS hrbp_user_pinned_tickets (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id  INTEGER NOT NULL REFERENCES hrbp_tickets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS ix_hrbp_user_pinned_tickets_user_id   ON hrbp_user_pinned_tickets(user_id);
CREATE INDEX IF NOT EXISTS ix_hrbp_user_pinned_tickets_ticket_id ON hrbp_user_pinned_tickets(ticket_id);

-- ── hrbp_tickets column additions (015, 017, 018, 019) ───────
ALTER TABLE hrbp_tickets
    ADD COLUMN IF NOT EXISTS sla_alerted_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attachments             TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS step_started_at         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS step_sla_alerted_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS step_sla_extended_until TIMESTAMPTZ;

-- Back-fill step_started_at for any pre-existing tickets
UPDATE hrbp_tickets SET step_started_at = created_at WHERE step_started_at IS NULL;

-- ── hrbp_notification_history (016) ──────────────────────────
CREATE TABLE IF NOT EXISTS hrbp_notification_history (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    ticket_id  INTEGER REFERENCES hrbp_tickets(id) ON DELETE SET NULL,
    title      TEXT NOT NULL,
    message    TEXT NOT NULL,
    notif_type TEXT NOT NULL DEFAULT 'general',
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrbp_notif_user_id   ON hrbp_notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_hrbp_notif_is_read   ON hrbp_notification_history(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_hrbp_notif_ticket_id ON hrbp_notification_history(ticket_id);

-- ── hrbp_exit_tracking (021, 022) ────────────────────────────
CREATE TABLE IF NOT EXISTS hrbp_exit_tracking (
    id                  SERIAL PRIMARY KEY,
    consultant_id       INTEGER NOT NULL REFERENCES hrbp_consultants(id),
    client_id           INTEGER NOT NULL REFERENCES hrbp_clients(id),
    initiated_by_id     INTEGER NOT NULL REFERENCES users(id),
    exit_date           DATE,
    notice_period_start DATE,
    exit_reason         TEXT NOT NULL,
    exit_type           TEXT NOT NULL,
    po_impact           NUMERIC(14, 2),
    status              TEXT NOT NULL DEFAULT 'initiated',
    replacement_needed  BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exit_tracking_consultant ON hrbp_exit_tracking(consultant_id);
CREATE INDEX IF NOT EXISTS idx_exit_tracking_client     ON hrbp_exit_tracking(client_id);
CREATE INDEX IF NOT EXISTS idx_exit_tracking_status     ON hrbp_exit_tracking(status);
CREATE INDEX IF NOT EXISTS idx_exit_tracking_created    ON hrbp_exit_tracking(created_at DESC);

ALTER TABLE hrbp_exit_tracking
    ADD COLUMN IF NOT EXISTS source_ticket_id INTEGER
        REFERENCES hrbp_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exit_tracking_source_ticket ON hrbp_exit_tracking(source_ticket_id);

-- ── hrbp_po_revisions (023) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS hrbp_po_revisions (
    id            SERIAL PRIMARY KEY,
    consultant_id INTEGER NOT NULL REFERENCES hrbp_consultants(id) ON DELETE CASCADE,
    client_id     INTEGER NOT NULL REFERENCES hrbp_clients(id),
    hrbp_id       INTEGER REFERENCES users(id),
    bh_id         INTEGER REFERENCES users(id),
    revised_at    DATE NOT NULL DEFAULT CURRENT_DATE,
    old_po_rate   NUMERIC(12, 2),
    new_po_rate   NUMERIC(12, 2) NOT NULL,
    hike_pct      NUMERIC(5, 2),
    ticket_id     INTEGER REFERENCES hrbp_tickets(id) ON DELETE SET NULL,
    ticket_number TEXT,
    status        TEXT NOT NULL DEFAULT 'pending_approval'
                  CHECK (status IN ('pending_approval', 'approved', 'rejected')),
    notes         TEXT,
    created_by_id INTEGER REFERENCES users(id),
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_revisions_consultant ON hrbp_po_revisions(consultant_id);
CREATE INDEX IF NOT EXISTS idx_po_revisions_ticket     ON hrbp_po_revisions(ticket_id);

-- ── users.role check constraint (002, 013, 020) ──────────────
-- Ensure the constraint includes all roles used by the HRBP system.
-- Migration 020 may have been missed on prod, leaving 'hrbp' blocked.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
    role IN ('admin', 'kam', 'recruiter', 'delivery_lead', 'coo', 'ceo', 'hrbp', 'bh', 'ops_head')
);
