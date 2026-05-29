-- BH Pod Monthly Plan — new tables only, no changes to existing schema
-- All DDL is idempotent (IF NOT EXISTS / IF NOT EXISTS indexes)

CREATE TABLE IF NOT EXISTS bh_pod_setups (
    id                      SERIAL PRIMARY KEY,
    pod_id                  INTEGER NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
    bh_user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month                   VARCHAR(20) NOT NULL,
    net_po_target           INTEGER NOT NULL DEFAULT 100,
    exit_budget             INTEGER NOT NULL DEFAULT 5,
    working_days            INTEGER NOT NULL DEFAULT 22,
    target_selects_month    INTEGER NOT NULL DEFAULT 50,
    sel_ob_rate             REAL    NOT NULL DEFAULT 0.8,
    subs_per_recruiter_day  INTEGER NOT NULL DEFAULT 6,
    num_recruiters          INTEGER NOT NULL DEFAULT 16,
    interviews_per_kam_day  INTEGER NOT NULL DEFAULT 12,
    num_kams                INTEGER NOT NULL DEFAULT 4,
    created_at              TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
    updated_at              TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
    UNIQUE (pod_id, month)
);

CREATE INDEX IF NOT EXISTS ix_bh_pod_setups_pod_id     ON bh_pod_setups(pod_id);
CREATE INDEX IF NOT EXISTS ix_bh_pod_setups_bh_user_id ON bh_pod_setups(bh_user_id);

CREATE TABLE IF NOT EXISTS bh_customer_targets (
    id                    SERIAL PRIMARY KEY,
    setup_id              INTEGER NOT NULL REFERENCES bh_pod_setups(id) ON DELETE CASCADE,
    client_id             INTEGER,
    customer_name         VARCHAR(120) NOT NULL,
    net_po_target_cust    INTEGER NOT NULL DEFAULT 0,
    exit_alloc            INTEGER NOT NULL DEFAULT 0,
    avg_po_per_ob         REAL    NOT NULL DEFAULT 3.5,
    open_demand_pool      INTEGER NOT NULL DEFAULT 0,
    repeat_demand_pct     REAL    NOT NULL DEFAULT 0.5,
    subs_repeat           INTEGER NOT NULL DEFAULT 0,
    subs_new_phase1       INTEGER NOT NULL DEFAULT 0,
    subs_new_phase2       INTEGER NOT NULL DEFAULT 0,
    target_interviews_day INTEGER NOT NULL DEFAULT 0,
    int_sel_target        REAL    NOT NULL DEFAULT 0.15,
    display_order         INTEGER NOT NULL DEFAULT 0,
    UNIQUE (setup_id, customer_name)
);

CREATE INDEX IF NOT EXISTS ix_bh_customer_targets_setup_id ON bh_customer_targets(setup_id);

CREATE TABLE IF NOT EXISTS bh_recruiter_assignments (
    id                    SERIAL PRIMARY KEY,
    setup_id              INTEGER NOT NULL REFERENCES bh_pod_setups(id) ON DELETE CASCADE,
    user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    primary_customer_id   INTEGER REFERENCES bh_customer_targets(id) ON DELETE SET NULL,
    secondary_customer_id INTEGER REFERENCES bh_customer_targets(id) ON DELETE SET NULL,
    subs_per_day          INTEGER NOT NULL DEFAULT 6,
    UNIQUE (setup_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_bh_recruiter_assignments_setup_id ON bh_recruiter_assignments(setup_id);

CREATE TABLE IF NOT EXISTS bh_kam_assignments (
    id               SERIAL PRIMARY KEY,
    setup_id         INTEGER NOT NULL REFERENCES bh_pod_setups(id) ON DELETE CASCADE,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_targets TEXT    NOT NULL DEFAULT '{}',
    tat_focus        VARCHAR(200),
    key_action       TEXT,
    UNIQUE (setup_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_bh_kam_assignments_setup_id ON bh_kam_assignments(setup_id);

CREATE TABLE IF NOT EXISTS bh_weekly_ob_targets (
    id                 SERIAL PRIMARY KEY,
    setup_id           INTEGER NOT NULL REFERENCES bh_pod_setups(id) ON DELETE CASCADE,
    customer_target_id INTEGER NOT NULL REFERENCES bh_customer_targets(id) ON DELETE CASCADE,
    week_num           INTEGER NOT NULL,
    week_label         VARCHAR(60),
    week_start         DATE    NOT NULL,
    week_end           DATE    NOT NULL,
    ob_target          INTEGER NOT NULL DEFAULT 0,
    UNIQUE (customer_target_id, week_num)
);

CREATE INDEX IF NOT EXISTS ix_bh_weekly_ob_targets_setup_id ON bh_weekly_ob_targets(setup_id);

CREATE TABLE IF NOT EXISTS bh_daily_actuals (
    id                 SERIAL PRIMARY KEY,
    setup_id           INTEGER NOT NULL REFERENCES bh_pod_setups(id) ON DELETE CASCADE,
    customer_target_id INTEGER NOT NULL REFERENCES bh_customer_targets(id) ON DELETE CASCADE,
    entry_date         DATE    NOT NULL,
    actual_subs        INTEGER NOT NULL DEFAULT 0,
    actual_interviews  INTEGER NOT NULL DEFAULT 0,
    actual_selects     INTEGER NOT NULL DEFAULT 0,
    actual_obs         INTEGER NOT NULL DEFAULT 0,
    updated_at         TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
    UNIQUE (customer_target_id, entry_date)
);

CREATE INDEX IF NOT EXISTS ix_bh_daily_actuals_setup_id   ON bh_daily_actuals(setup_id);
CREATE INDEX IF NOT EXISTS ix_bh_daily_actuals_entry_date ON bh_daily_actuals(entry_date);
