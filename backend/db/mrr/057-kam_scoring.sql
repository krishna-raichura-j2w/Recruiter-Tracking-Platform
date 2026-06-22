-- AI resume-vs-JD scoring (KAM Interviews Suggestion).
-- Fully additive — new tables only, no FK to production tables, no ALTERs.
-- Idempotent: safe to run on every startup.

CREATE TABLE IF NOT EXISTS ai_jd_rubrics (
    id                SERIAL PRIMARY KEY,
    job_id            INTEGER NOT NULL UNIQUE,
    jd_text_effective TEXT,
    jd_is_override    BOOLEAN NOT NULL DEFAULT FALSE,
    jd_override_by    INTEGER,
    jd_hash           VARCHAR(64),
    rubric_json       TEXT,
    skills_json       TEXT,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
    error             TEXT,
    model             VARCHAR(60),
    created_at        TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc'),
    updated_at        TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS ix_ai_jd_rubrics_job_id ON ai_jd_rubrics (job_id);

CREATE TABLE IF NOT EXISTS ai_candidate_scores (
    id                     SERIAL PRIMARY KEY,
    candidate_id           INTEGER NOT NULL,
    job_id                 INTEGER NOT NULL,
    rubric_id              INTEGER,
    bucket                 VARCHAR(8),
    wait_weight            INTEGER,
    overall_score          REAL,
    rank_score             REAL,
    criteria_scores_json   TEXT,
    skill_assessments_json TEXT,
    extracted_json         TEXT,
    resume_key             VARCHAR(500),
    resume_hash            VARCHAR(64),
    rubric_hash            VARCHAR(64),
    decision               VARCHAR(10) NOT NULL DEFAULT 'pending',
    status                 VARCHAR(12) NOT NULL DEFAULT 'scored',
    error                  TEXT,
    model                  VARCHAR(60),
    scored_at              TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc'),
    CONSTRAINT uq_ai_candidate_scores_cand_job UNIQUE (candidate_id, job_id)
);
CREATE INDEX IF NOT EXISTS ix_ai_candidate_scores_candidate_id ON ai_candidate_scores (candidate_id);
CREATE INDEX IF NOT EXISTS ix_ai_candidate_scores_job_id ON ai_candidate_scores (job_id);

CREATE TABLE IF NOT EXISTS ai_candidate_rejects (
    id           SERIAL PRIMARY KEY,
    candidate_id INTEGER NOT NULL,
    job_id       INTEGER NOT NULL,
    rejected_by  INTEGER,
    reason       TEXT,
    created_at   TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc'),
    CONSTRAINT uq_ai_candidate_rejects_cand_job UNIQUE (candidate_id, job_id)
);
CREATE INDEX IF NOT EXISTS ix_ai_candidate_rejects_candidate_id ON ai_candidate_rejects (candidate_id);

CREATE TABLE IF NOT EXISTS ai_scoring_runs (
    id          SERIAL PRIMARY KEY,
    kam_user_id INTEGER NOT NULL,
    status      VARCHAR(10) NOT NULL DEFAULT 'running',
    total       INTEGER NOT NULL DEFAULT 0,
    completed   INTEGER NOT NULL DEFAULT 0,
    started_at  TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc'),
    finished_at TIMESTAMP,
    error       TEXT
);
CREATE INDEX IF NOT EXISTS ix_ai_scoring_runs_kam_user_id ON ai_scoring_runs (kam_user_id);
