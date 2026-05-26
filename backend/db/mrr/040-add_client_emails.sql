CREATE TABLE IF NOT EXISTS client_emails (
    id          SERIAL PRIMARY KEY,
    job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    subject     TEXT,
    email_html  TEXT,
    email_json  TEXT,       -- raw AI JSON response
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc')
);
