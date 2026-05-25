-- ============================================================
-- MIGRATION: 011_create_tickets_module.sql
-- Creates all tables for the Tickets module.
-- Run after 010_add_bh_id_to_cadence_schedules.sql
-- ============================================================

-- ── 1. Tickets (main) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hrbp_tickets (
    id                  SERIAL PRIMARY KEY,
    ticket_number       TEXT UNIQUE NOT NULL,
    title               TEXT NOT NULL,
    raised_by_id        INTEGER NOT NULL REFERENCES users(id),
    escalation_mgr_id   INTEGER REFERENCES users(id),
    client_id           INTEGER NOT NULL REFERENCES hrbp_clients(id),
    sop_id              INTEGER REFERENCES hrbp_sop_definitions(id),
    priority            TEXT NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('critical','high','medium','low')),
    sla_deadline        TIMESTAMPTZ,
    description         TEXT,
    po_risk_amount      NUMERIC(14, 2),
    status              TEXT NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','closed')),
    -- snapshot of the hierarchy at time of creation (JSONB array of steps)
    hierarchy_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_step        SMALLINT NOT NULL DEFAULT 1,
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrbp_tickets_raised_by   ON hrbp_tickets(raised_by_id);
CREATE INDEX IF NOT EXISTS idx_hrbp_tickets_client       ON hrbp_tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_hrbp_tickets_status       ON hrbp_tickets(status);
CREATE INDEX IF NOT EXISTS idx_hrbp_tickets_priority     ON hrbp_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_hrbp_tickets_sop          ON hrbp_tickets(sop_id);

-- ── 2. Ticket ↔ Consultant  (many-to-many) ───────────────────
CREATE TABLE IF NOT EXISTS hrbp_ticket_consultants (
    ticket_id           INTEGER NOT NULL REFERENCES hrbp_tickets(id) ON DELETE CASCADE,
    consultant_id       INTEGER NOT NULL REFERENCES hrbp_consultants(id),
    PRIMARY KEY (ticket_id, consultant_id)
);

-- ── 3. Ticket Comments ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS hrbp_ticket_comments (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL REFERENCES hrbp_tickets(id) ON DELETE CASCADE,
    author_id       INTEGER NOT NULL REFERENCES users(id),
    hierarchy_step  SMALLINT NOT NULL,
    content         TEXT NOT NULL,
    is_resolution   BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrbp_ticket_comments_ticket ON hrbp_ticket_comments(ticket_id);

-- ── 4. Ticket Activity Log ───────────────────────────────────
CREATE TABLE IF NOT EXISTS hrbp_ticket_activity_log (
    id          SERIAL PRIMARY KEY,
    ticket_id   INTEGER NOT NULL REFERENCES hrbp_tickets(id) ON DELETE CASCADE,
    actor_id    INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrbp_ticket_activity_ticket ON hrbp_ticket_activity_log(ticket_id);

-- ── 5. Sequence for ticket numbers ──────────────────────────
CREATE SEQUENCE IF NOT EXISTS hrbp_ticket_seq START 1;
