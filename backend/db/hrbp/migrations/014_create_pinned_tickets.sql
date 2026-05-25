-- Migration 014: pinned tickets (one pin per user)
CREATE TABLE IF NOT EXISTS hrbp_user_pinned_tickets (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id  INTEGER NOT NULL REFERENCES hrbp_tickets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)   -- each user may pin exactly one ticket at a time
);

CREATE INDEX IF NOT EXISTS ix_hrbp_user_pinned_tickets_user_id   ON hrbp_user_pinned_tickets(user_id);
CREATE INDEX IF NOT EXISTS ix_hrbp_user_pinned_tickets_ticket_id ON hrbp_user_pinned_tickets(ticket_id);
