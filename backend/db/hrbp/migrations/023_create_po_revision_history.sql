-- Migration 023: PO Revision History
-- Tracks every PO rate change for a consultant.
-- Status field is reserved for a future approval workflow (pending_approval → approved/rejected).

CREATE TABLE IF NOT EXISTS hrbp_po_revisions (
    id              SERIAL PRIMARY KEY,
    consultant_id   INTEGER NOT NULL REFERENCES hrbp_consultants(id) ON DELETE CASCADE,
    client_id       INTEGER NOT NULL REFERENCES hrbp_clients(id),
    hrbp_id         INTEGER REFERENCES users(id),
    bh_id           INTEGER REFERENCES users(id),
    revised_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    old_po_rate     NUMERIC(12, 2),
    new_po_rate     NUMERIC(12, 2) NOT NULL,
    hike_pct        NUMERIC(5, 2),            -- stored for audit integrity, even if derivable
    ticket_id       INTEGER REFERENCES hrbp_tickets(id) ON DELETE SET NULL,
    ticket_number   TEXT,                     -- denormalised for fast display
    status          TEXT NOT NULL DEFAULT 'pending_approval'
                    CHECK (status IN ('pending_approval', 'approved', 'rejected')),
    notes           TEXT,
    created_by_id   INTEGER REFERENCES users(id),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_revisions_consultant ON hrbp_po_revisions(consultant_id);
CREATE INDEX IF NOT EXISTS idx_po_revisions_ticket     ON hrbp_po_revisions(ticket_id);
