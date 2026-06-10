-- ============================================================
-- Migration 030: Create hrbp_ticket_step_submissions
-- Stores the structured per-step action submissions for each
-- ticket step (form data, RAG selection, document uploads, etc.)
-- Separate from hrbp_ticket_comments which handles free text.
-- ============================================================

CREATE TABLE IF NOT EXISTS hrbp_ticket_step_submissions (
    id              BIGSERIAL   PRIMARY KEY,
    ticket_id       INTEGER     NOT NULL REFERENCES hrbp_tickets(id) ON DELETE CASCADE,
    step_number     SMALLINT    NOT NULL,
    medium          TEXT        NOT NULL,   -- email | document | form | rag | document_ai_summary | comment | status_update
    submitted_by    INTEGER     NOT NULL,   -- FK to users (integer on localhost, UUID on Supabase)
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Flexible payload: RAG value, form field map, status selection, email sent flag, etc.
    form_data       JSONB,

    -- File paths for document / document_ai_summary steps
    attachments     TEXT[],

    -- Populated server-side for document_ai_summary medium
    ai_summary      TEXT,

    CONSTRAINT chk_medium CHECK (medium IN (
        'email', 'document', 'form', 'rag', 'document_ai_summary', 'comment', 'status_update'
    ))
);

CREATE INDEX idx_step_submissions_ticket     ON hrbp_ticket_step_submissions (ticket_id);
CREATE INDEX idx_step_submissions_ticket_step ON hrbp_ticket_step_submissions (ticket_id, step_number);
