-- Migration 036: Create project management tables
--
-- Adds three tables that support the Projects feature:
--   hrbp_projects              — project definitions (name, client, status)
--   hrbp_project_members       — consultants assigned to a project with cohort badge + perf tier
--   hrbp_project_comment_history — immutable log of AI-analysed team-level comments
--
-- All statements are idempotent (IF NOT EXISTS / IF NOT EXISTS on columns).

-- ── Projects ──────────────────────────────────────────────────────────────────
-- Core project record. client_id is optional — a project may span clients or be standalone.

CREATE TABLE IF NOT EXISTS hrbp_projects (
    id          SERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    client_id   INTEGER     REFERENCES hrbp_clients(id) ON DELETE SET NULL,
    status      TEXT        NOT NULL DEFAULT 'active',   -- active | archived
    created_by  INTEGER     REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_status     ON hrbp_projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_client     ON hrbp_projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON hrbp_projects(created_at DESC);

-- ── Project Members ───────────────────────────────────────────────────────────
-- One row per consultant per project. Cohort and perf_tier are project-specific
-- assignments made by the HRBP — they do not overwrite the global consultant record.
--
-- cohort values  : star | high_performer | rising | bedrock | new_joiner | watch | rescue
-- perf_tier values: top_20 | middle | bottom_20

CREATE TABLE IF NOT EXISTS hrbp_project_members (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER     NOT NULL REFERENCES hrbp_projects(id)    ON DELETE CASCADE,
    consultant_id   INTEGER     NOT NULL REFERENCES hrbp_consultants(id) ON DELETE CASCADE,
    cohort          TEXT        NOT NULL DEFAULT 'bedrock',
    perf_tier       TEXT        NOT NULL DEFAULT 'middle',
    role_in_project TEXT        NOT NULL DEFAULT '',
    added_by        INTEGER     REFERENCES users(id),
    added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_project_member UNIQUE (project_id, consultant_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project    ON hrbp_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_consultant ON hrbp_project_members(consultant_id);

-- ── Project Comment History ───────────────────────────────────────────────────
-- Immutable log written each time a team-level comment is analysed.
-- targeted_consultant_ids: JSONB array of consultant IDs — empty array means all members.
-- changes_detail:  JSONB map of {consultant_id: {category_key: {from_label, to_label, score_diff}}}

CREATE TABLE IF NOT EXISTS hrbp_project_comment_history (
    id                      SERIAL PRIMARY KEY,
    project_id              INTEGER     NOT NULL REFERENCES hrbp_projects(id) ON DELETE CASCADE,
    comment                 TEXT        NOT NULL,
    explanation             TEXT,
    targeted_consultant_ids JSONB       NOT NULL DEFAULT '[]',
    changes_detail          JSONB,
    score_before            INTEGER,
    score_after             INTEGER,
    score_delta             INTEGER,
    created_by              INTEGER     REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proj_comment_project    ON hrbp_project_comment_history(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_comment_created_at ON hrbp_project_comment_history(project_id, created_at DESC);
