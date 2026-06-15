-- Migration 035: Create governance scoring tables
-- Idempotent — safe to run on any environment (new or existing).
-- Covers three tables: governance scores, custom categories, and comment history.

-- ── Governance Scores ─────────────────────────────────────────────────────────
-- One row per consultant per category. option_index (0=best, 4=worst) and
-- escalations drive the net_score. is_active lets HRBP hide categories per
-- consultant without deleting history.

CREATE TABLE IF NOT EXISTS hrbp_governance_scores (
    id            SERIAL PRIMARY KEY,
    consultant_id INTEGER NOT NULL REFERENCES hrbp_consultants(id) ON DELETE CASCADE,
    category_key  TEXT    NOT NULL,
    option_index  INTEGER NOT NULL DEFAULT 0,
    escalations   INTEGER NOT NULL DEFAULT 0,
    net_score     INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gov_scores_consultant
    ON hrbp_governance_scores(consultant_id);

CREATE INDEX IF NOT EXISTS idx_gov_scores_consultant_active
    ON hrbp_governance_scores(consultant_id, is_active);

-- ── Custom Categories ─────────────────────────────────────────────────────────
-- HRBP can add categories beyond the 9 hardcoded defaults. Each custom category
-- belongs to one consultant and stores its own 5-level options as JSONB.

CREATE TABLE IF NOT EXISTS hrbp_governance_custom_categories (
    id              SERIAL PRIMARY KEY,
    consultant_id   INTEGER NOT NULL REFERENCES hrbp_consultants(id) ON DELETE CASCADE,
    key             TEXT    NOT NULL,
    label           TEXT    NOT NULL,
    max_score       INTEGER NOT NULL,
    escalation_base INTEGER NOT NULL DEFAULT 2,
    description     TEXT    NOT NULL DEFAULT '',
    options         JSONB   NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gov_custom_cat_consultant
    ON hrbp_governance_custom_categories(consultant_id);

-- ── Comment History ───────────────────────────────────────────────────────────
-- Immutable log of every AI-analysed comment. Stores the score before/after,
-- per-category changes as JSONB, and the AI explanation for audit purposes.

CREATE TABLE IF NOT EXISTS hrbp_governance_comment_history (
    id             SERIAL PRIMARY KEY,
    consultant_id  INTEGER NOT NULL REFERENCES hrbp_consultants(id) ON DELETE CASCADE,
    comment        TEXT    NOT NULL,
    explanation    TEXT,
    score_before   INTEGER,
    score_after    INTEGER,
    score_delta    INTEGER,
    changes_detail JSONB,
    created_by     INTEGER REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gov_history_consultant
    ON hrbp_governance_comment_history(consultant_id);

CREATE INDEX IF NOT EXISTS idx_gov_history_created_at
    ON hrbp_governance_comment_history(consultant_id, created_at DESC);

-- ── Patch for upgraded environments ──────────────────────────────────────────
-- If hrbp_governance_scores was created before is_active was added to the
-- SQLAlchemy model (early Phase 2 installs), add the column now.

ALTER TABLE hrbp_governance_scores
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
