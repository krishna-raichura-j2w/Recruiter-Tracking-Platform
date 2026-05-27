-- Exit Tracking module
-- Tracks consultant exit initiations, PO impact, and lifecycle status.

CREATE TABLE IF NOT EXISTS hrbp_exit_tracking (
    id                    SERIAL PRIMARY KEY,
    consultant_id         INTEGER NOT NULL REFERENCES hrbp_consultants(id),
    client_id             INTEGER NOT NULL REFERENCES hrbp_clients(id),
    initiated_by_id       INTEGER NOT NULL REFERENCES users(id),
    exit_date             DATE,
    notice_period_start   DATE,
    exit_reason           TEXT NOT NULL,   -- resignation | end_of_contract | termination | mutual_separation
    exit_type             TEXT NOT NULL,   -- voluntary | involuntary
    po_impact             NUMERIC(14, 2),  -- snapshot of monthly_po at time of initiation
    status                TEXT NOT NULL DEFAULT 'initiated',  -- initiated | acknowledged | completed
    replacement_needed    BOOLEAN NOT NULL DEFAULT FALSE,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exit_tracking_consultant ON hrbp_exit_tracking(consultant_id);
CREATE INDEX IF NOT EXISTS idx_exit_tracking_client     ON hrbp_exit_tracking(client_id);
CREATE INDEX IF NOT EXISTS idx_exit_tracking_status     ON hrbp_exit_tracking(status);
CREATE INDEX IF NOT EXISTS idx_exit_tracking_created    ON hrbp_exit_tracking(created_at DESC);
