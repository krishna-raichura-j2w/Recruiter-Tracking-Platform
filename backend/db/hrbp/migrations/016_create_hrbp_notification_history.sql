-- Migration 016: HRBP notification history table
-- Stores in-app notifications specific to the HRBP module,
-- separate from the MRR notifications table.

CREATE TABLE IF NOT EXISTS hrbp_notification_history (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    ticket_id   INTEGER REFERENCES hrbp_tickets(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    notif_type  TEXT NOT NULL DEFAULT 'general',
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrbp_notif_user_id   ON hrbp_notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_hrbp_notif_is_read   ON hrbp_notification_history(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_hrbp_notif_ticket_id ON hrbp_notification_history(ticket_id);
