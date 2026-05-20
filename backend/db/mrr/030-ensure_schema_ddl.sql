CREATE TABLE IF NOT EXISTS pod_memberships (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pod_lead_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_pod_membership UNIQUE (user_id, pod_lead_id)
);
CREATE INDEX IF NOT EXISTS ix_pod_memberships_user_id     ON pod_memberships(user_id);
CREATE INDEX IF NOT EXISTS ix_pod_memberships_pod_lead_id ON pod_memberships(pod_lead_id);
CREATE TABLE IF NOT EXISTS probing_data (
    id                          SERIAL PRIMARY KEY,
    job_id                      INTEGER,
    reporting_manager_location  TEXT,
    onsite_opportunities        TEXT,
    project_size                TEXT,
    project_count               TEXT,
    work_mode                   TEXT,
    candidate_role              TEXT,
    feedback_eta                TEXT,
    work_location               TEXT,
    interview_type              TEXT,
    role_clarity                TEXT,
    notice_period               TEXT,
    interview_rounds_count      TEXT,
    urgency_eta                 TEXT,
    skill_type                  TEXT,
    created_by_id               INTEGER REFERENCES users(id),
    created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_id INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS probing_id INTEGER REFERENCES probing_data(id);
ALTER TABLE jobs         ALTER COLUMN job_id TYPE INTEGER USING NULLIF(job_id::text, '')::INTEGER;
ALTER TABLE probing_data ALTER COLUMN job_id TYPE INTEGER USING NULLIF(job_id::text, '')::INTEGER;
ALTER TABLE jobs         ADD COLUMN IF NOT EXISTS email_id VARCHAR(200);
ALTER TABLE probing_data ADD COLUMN IF NOT EXISTS email_id VARCHAR(200);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS delivery_lead_ids TEXT DEFAULT '[]';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS userrole;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'bh', 'kam', 'recruiter', 'delivery_lead', 'coo'));
CREATE TABLE IF NOT EXISTS pods (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(120) NOT NULL UNIQUE,
    bh_user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pod_id INTEGER REFERENCES pods(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS ix_users_pod_id         ON users(pod_id);
CREATE INDEX IF NOT EXISTS ix_users_parent_user_id ON users(parent_user_id);
CREATE TABLE IF NOT EXISTS hourly_targets (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          DATE    NOT NULL,
    slot_index    INTEGER NOT NULL,
    target_count  INTEGER NOT NULL DEFAULT 0,
    created_by_id INTEGER REFERENCES users(id),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_hourly_target UNIQUE (user_id, date, slot_index)
);
CREATE INDEX IF NOT EXISTS ix_hourly_targets_user_date ON hourly_targets(user_id, date);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS first_name       VARCHAR(100);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_name        VARCHAR(100);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location         VARCHAR(200);
UPDATE candidates SET location = location_id::text WHERE location IS NULL AND location_id IS NOT NULL;
ALTER TABLE candidates DROP COLUMN IF EXISTS location_id;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS contact_phone    VARCHAR(30);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS gender           VARCHAR(20);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS designation      VARCHAR(200);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS employer         VARCHAR(200);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS total_experience DOUBLE PRECISION;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS min_experience   DOUBLE PRECISION;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS max_experience   DOUBLE PRECISION;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_ctc      DOUBLE PRECISION;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS expected_ctc     DOUBLE PRECISION;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume           TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS role_id          INTEGER     NOT NULL DEFAULT 4;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS type             VARCHAR(50) NOT NULL DEFAULT 'UserCandidate';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS created_by       VARCHAR(200);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS dl_verified      BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE candidates SET role_id = 4              WHERE role_id IS NULL;
UPDATE candidates SET type    = 'UserCandidate' WHERE type    IS NULL;
UPDATE candidates SET created_by = u.email FROM users u WHERE candidates.created_by IS NULL AND candidates.sourced_by_id = u.id;
UPDATE candidates SET dl_verified = TRUE FROM validations v WHERE v.candidate_id = candidates.id AND v.status = 'validated' AND candidates.dl_verified IS DISTINCT FROM TRUE
