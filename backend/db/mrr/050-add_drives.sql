-- Walk-in / Drive feature — drive cards (fulfilment plan), drive calls, and
-- candidate drive-tracking columns. All DDL idempotent. Enum columns use VARCHAR
-- (matches the codebase's native_enum=False convention; validation is app-level).

CREATE TABLE IF NOT EXISTS drives (
    id                          SERIAL PRIMARY KEY,
    job_id                      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    drive_type                  VARCHAR(30)  DEFAULT 'walkin',
    status                      VARCHAR(30)  DEFAULT 'planned',
    open_positions              INTEGER,
    conversion_rate             NUMERIC(5,4) DEFAULT 0.10,
    buffer_pct                  NUMERIC(5,4) DEFAULT 0.25,
    show_rate                   NUMERIC(5,4) DEFAULT 0.65,
    submission_target_override  INTEGER,
    drive_date_from             DATE,
    drive_date_upto             DATE,
    start_time                  VARCHAR(20),
    end_time                    VARCHAR(20),
    venue                       TEXT,
    dress_code                  VARCHAR(200),
    virtual_link                TEXT,
    portal_cutoff               TIMESTAMP WITHOUT TIME ZONE,
    bh_owner_id                 INTEGER REFERENCES users(id),
    kam_owner_id                INTEGER REFERENCES users(id),
    dl_owner_id                 INTEGER REFERENCES users(id),
    notes                       TEXT,
    created_by_id               INTEGER REFERENCES users(id),
    created_at                  TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
    updated_at                  TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS ix_drives_job_id ON drives(job_id);

CREATE TABLE IF NOT EXISTS drive_calls (
    id           SERIAL PRIMARY KEY,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    drive_id     INTEGER NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
    caller_id    INTEGER REFERENCES users(id),
    call_type    VARCHAR(30) NOT NULL,
    call_date    TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
    outcome      VARCHAR(100),
    notes        TEXT,
    created_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS ix_drive_calls_candidate_id ON drive_calls(candidate_id);
CREATE INDEX IF NOT EXISTS ix_drive_calls_drive_id     ON drive_calls(drive_id);

-- Candidate ↔ drive link + drive tracker state
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS drive_id            INTEGER REFERENCES drives(id);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS drive_tracker_stage VARCHAR(30);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS drive_reached_at    TIMESTAMP WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS ix_candidates_drive_id ON candidates(drive_id);

-- Backfill: auto-create one drive card for any existing walk-in / drive job that
-- doesn't already have one. Idempotent via the NOT EXISTS guard. We set status &
-- buffer_pct explicitly here because the table is created by SQLAlchemy's
-- create_all() (whose model defaults are Python-side, not DB server-defaults), so
-- the CREATE TABLE ... DEFAULT clauses above are no-ops on an existing table.
INSERT INTO drives (job_id, drive_type, status, open_positions, conversion_rate,
                    buffer_pct, show_rate, drive_date_from, drive_date_upto,
                    start_time, end_time, kam_owner_id, dl_owner_id)
SELECT j.id,
       CASE WHEN j.walkin = TRUE THEN 'walkin' ELSE 'virtual' END,
       'planned',
       j.headcount,
       CASE WHEN lower(coalesce(j.client_name, '')) LIKE '%infosys%' THEN 0.20 ELSE 0.10 END,
       0.25,
       CASE WHEN j.walkin = TRUE THEN 0.65 ELSE 0.80 END,
       j.date_from, j.date_upto, j.start_time, j.end_time,
       j.kam_id, j.delivery_lead_id
FROM jobs j
WHERE (j.walkin = TRUE OR j.drive = TRUE)
  AND NOT EXISTS (SELECT 1 FROM drives d WHERE d.job_id = j.id);

-- Repair any rows (from an earlier backfill) left with NULL status / buffer.
UPDATE drives SET status = 'planned' WHERE status IS NULL;
UPDATE drives SET buffer_pct = 0.25 WHERE buffer_pct IS NULL;
