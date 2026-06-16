-- 037: track project-sourced entries in individual governance comment history
-- Adds source (direct | project), project_id, and project_name so that when a
-- project team comment updates a consultant's scores, the entry appears in their
-- individual governance history labelled with the originating project.

ALTER TABLE hrbp_governance_comment_history
    ADD COLUMN IF NOT EXISTS source       TEXT    DEFAULT 'direct',
    ADD COLUMN IF NOT EXISTS project_id   INTEGER REFERENCES hrbp_projects(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS project_name TEXT;

CREATE INDEX IF NOT EXISTS idx_gov_comment_history_source
    ON hrbp_governance_comment_history (source);

CREATE INDEX IF NOT EXISTS idx_gov_comment_history_project_id
    ON hrbp_governance_comment_history (project_id)
    WHERE project_id IS NOT NULL;
