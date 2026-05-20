-- ============================================================
-- MIGRATION: 005_create_cadence_scheduler_tables.sql
-- Depends on: hrbp_clients, hrbp_consultants, users
-- ============================================================

-- ============================================================
-- TABLE 1: hrbp_cadence_schedules  (parent / definition)
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_cadence_schedules (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id            UUID NOT NULL REFERENCES hrbp_clients(id),
    consultant_id        UUID NOT NULL REFERENCES hrbp_consultants(id),
    hrbp_id              UUID NOT NULL REFERENCES users(id),
    meeting_type         TEXT NOT NULL CHECK (meeting_type IN ('one_time', 'recurring')),
    start_date           DATE NOT NULL,
    end_date             DATE,
    frequency_weeks      SMALLINT NOT NULL DEFAULT 1 CHECK (frequency_weeks >= 1),
    status               TEXT NOT NULL DEFAULT 'not_started'
                             CHECK (status IN ('not_started', 'in_progress', 'completed', 'cancelled')),
    supporting_documents TEXT[]   DEFAULT '{}',
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_end_date_recurring
        CHECK (meeting_type = 'one_time' OR end_date IS NOT NULL),
    CONSTRAINT chk_end_date_order
        CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_cadence_schedules_client
    ON hrbp_cadence_schedules(client_id);
CREATE INDEX IF NOT EXISTS idx_cadence_schedules_consultant
    ON hrbp_cadence_schedules(consultant_id);
CREATE INDEX IF NOT EXISTS idx_cadence_schedules_hrbp
    ON hrbp_cadence_schedules(hrbp_id);
CREATE INDEX IF NOT EXISTS idx_cadence_schedules_status
    ON hrbp_cadence_schedules(status);

-- ============================================================
-- TABLE 2: hrbp_cadence_sessions  (one row per meeting slot)
-- ============================================================
CREATE TABLE IF NOT EXISTS hrbp_cadence_sessions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id          UUID NOT NULL REFERENCES hrbp_cadence_schedules(id) ON DELETE CASCADE,
    cadence_number       SMALLINT NOT NULL,
    scheduled_date       DATE NOT NULL,
    status               TEXT NOT NULL DEFAULT 'not_started'
                             CHECK (status IN ('not_started', 'completed', 'cancelled')),
    comments             TEXT,
    rca_status           TEXT,
    supporting_documents TEXT[]   DEFAULT '{}',
    completed_at         TIMESTAMPTZ,
    completed_by         UUID REFERENCES users(id),
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),

    UNIQUE (schedule_id, cadence_number)
);

CREATE INDEX IF NOT EXISTS idx_cadence_sessions_schedule
    ON hrbp_cadence_sessions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_cadence_sessions_date
    ON hrbp_cadence_sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cadence_sessions_status
    ON hrbp_cadence_sessions(status);
