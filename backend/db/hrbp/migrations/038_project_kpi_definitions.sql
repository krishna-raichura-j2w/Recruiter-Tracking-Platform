-- 038: project-level KPI definitions
-- Stores which governance categories apply to a project.
-- When a consultant is added to a project that has KPI definitions,
-- their active governance categories are synced to match the project's KPI set.

CREATE TABLE IF NOT EXISTS hrbp_project_kpi_definitions (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES hrbp_projects(id) ON DELETE CASCADE,
    category_key    TEXT NOT NULL,       -- standard key (e.g. "timing") or "custom_{slug}"
    label           TEXT NOT NULL,
    max_score       INTEGER NOT NULL DEFAULT 10,
    escalation_base INTEGER NOT NULL DEFAULT 2,
    description     TEXT DEFAULT '',
    is_custom       BOOLEAN NOT NULL DEFAULT FALSE,
    options         JSONB,               -- NULL for standard categories; populated for custom
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, category_key)
);

CREATE INDEX IF NOT EXISTS idx_project_kpi_project_id
    ON hrbp_project_kpi_definitions (project_id);
