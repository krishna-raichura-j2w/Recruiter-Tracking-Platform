ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_caller_id INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS recruiter_type VARCHAR(20);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcer_ids TEXT DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS caller_ids TEXT DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_raw_text TEXT;
CREATE TABLE IF NOT EXISTS submission_timeline (
    id             SERIAL PRIMARY KEY,
    submission_id  INTEGER NOT NULL REFERENCES submissions(id),
    stage          VARCHAR(60) NOT NULL,
    stage_label    VARCHAR(120),
    interview_date VARCHAR(30),
    feedback       VARCHAR(30),
    note           TEXT,
    updated_by_id  INTEGER REFERENCES users(id),
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS consultant_mails (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER UNIQUE NOT NULL REFERENCES candidates(id),
    sent_by_id INTEGER REFERENCES users(id),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    exit_date VARCHAR(20),
    acknowledgement_received BOOLEAN DEFAULT FALSE,
    acknowledgement_at TIMESTAMP WITH TIME ZONE,
    dl_verified BOOLEAN DEFAULT FALSE,
    dl_verified_at TIMESTAMP WITH TIME ZONE
);
CREATE TABLE IF NOT EXISTS account_managers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS account_manager_id INTEGER REFERENCES account_managers(id);
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) UNIQUE NOT NULL,
    short_name VARCHAR(80),
    website_url VARCHAR(300),
    logo_data TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated_by VARCHAR(120)
);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_updated_by VARCHAR(120);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITH TIME ZONE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(200);
ALTER TABLE consultant_mails ADD COLUMN IF NOT EXISTS exit_proof TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_data TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcing_deadline TIMESTAMP WITH TIME ZONE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calling_deadline TIMESTAMP WITH TIME ZONE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcing_warned BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcing_alerted BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calling_warned BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calling_alerted BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_job_id VARCHAR(100);
ALTER TABLE of_clients ADD COLUMN IF NOT EXISTS client_id INTEGER;
ALTER TABLE of_clients ADD CONSTRAINT of_clients_client_id_key UNIQUE (client_id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES of_clients(client_id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS demand_source VARCHAR(80);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS demand_type VARCHAR(50);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS demand_exclusivity VARCHAR(50);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcing_target INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS kam_id INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS secondary_role VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
CREATE TABLE IF NOT EXISTS audit_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    action      VARCHAR(100),
    entity_type VARCHAR(100),
    entity_id   INTEGER,
    detail      TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs(created_at DESC)
