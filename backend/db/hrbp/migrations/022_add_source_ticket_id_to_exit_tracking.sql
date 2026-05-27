-- Link exit records back to the ticket that triggered them.
-- Nullable so manually-created exits (no ticket) still work.

ALTER TABLE hrbp_exit_tracking
    ADD COLUMN IF NOT EXISTS source_ticket_id INTEGER
        REFERENCES hrbp_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exit_tracking_source_ticket
    ON hrbp_exit_tracking(source_ticket_id);
