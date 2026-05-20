-- ============================================================
-- MIGRATION: 003_fix_hrbp_user_fks.sql
-- Fixes three issues found on first seed run:
--   1. users table is missing columns (name, role, phone, etc.)
--      because SQLAlchemy create_all() hasn't run yet.
--   2. HRBP tables declared user FK columns as UUID but
--      users.id is INTEGER — type mismatch.
--   3. Duplicate rows in hrbp_clients from re-run of seed 006.
-- ============================================================

-- ── 1. Patch users table with missing columns ─────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS name                 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role                 VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone                TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active            BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- ── 2. Extend role CHECK constraint to include HRBP roles ─────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS userrole;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
    role IN ('admin','kam','recruiter','delivery_lead','coo','hrbp','bh','ops_head')
);

-- ── 3. Clean up duplicate hrbp_clients rows ───────────────────
-- Keep only the earliest row per name
DELETE FROM hrbp_clients
WHERE id NOT IN (
    SELECT DISTINCT ON (name) id
    FROM hrbp_clients
    ORDER BY name, created_at ASC
);

-- ── 4. hrbp_clients: UUID user FK cols → INTEGER ──────────────
ALTER TABLE hrbp_clients DROP COLUMN IF EXISTS bh_id;
ALTER TABLE hrbp_clients DROP COLUMN IF EXISTS hrbp_id;
ALTER TABLE hrbp_clients ADD COLUMN bh_id   INTEGER REFERENCES users(id);
ALTER TABLE hrbp_clients ADD COLUMN hrbp_id INTEGER REFERENCES users(id);

-- ── 5. hrbp_consultants: UUID hrbp_id → INTEGER ───────────────
-- Table is empty (seed 007 failed), safe to drop and re-add NOT NULL
ALTER TABLE hrbp_consultants DROP COLUMN IF EXISTS hrbp_id;
ALTER TABLE hrbp_consultants ADD COLUMN hrbp_id INTEGER NOT NULL REFERENCES users(id);

-- ── 6. hrbp_incidents: UUID opened_by → INTEGER ───────────────
ALTER TABLE hrbp_incidents DROP COLUMN IF EXISTS opened_by;
ALTER TABLE hrbp_incidents ADD COLUMN opened_by INTEGER NOT NULL REFERENCES users(id);

-- ── 7. hrbp_sop_steps: UUID user cols → INTEGER ───────────────
ALTER TABLE hrbp_sop_steps DROP COLUMN IF EXISTS owner_user_id;
ALTER TABLE hrbp_sop_steps DROP COLUMN IF EXISTS escalated_to_user;
ALTER TABLE hrbp_sop_steps DROP COLUMN IF EXISTS completed_by;
ALTER TABLE hrbp_sop_steps ADD COLUMN owner_user_id     INTEGER REFERENCES users(id);
ALTER TABLE hrbp_sop_steps ADD COLUMN escalated_to_user INTEGER REFERENCES users(id);
ALTER TABLE hrbp_sop_steps ADD COLUMN completed_by      INTEGER REFERENCES users(id);

-- ── 8. hrbp_signals: UUID logged_by → INTEGER ─────────────────
ALTER TABLE hrbp_signals DROP COLUMN IF EXISTS logged_by;
ALTER TABLE hrbp_signals ADD COLUMN logged_by INTEGER NOT NULL REFERENCES users(id);

-- ── 9. hrbp_routine_schedules: UUID user cols → INTEGER ───────
ALTER TABLE hrbp_routine_schedules DROP COLUMN IF EXISTS assigned_to;
ALTER TABLE hrbp_routine_schedules DROP COLUMN IF EXISTS completed_by;
ALTER TABLE hrbp_routine_schedules ADD COLUMN assigned_to  INTEGER NOT NULL REFERENCES users(id);
ALTER TABLE hrbp_routine_schedules ADD COLUMN completed_by INTEGER REFERENCES users(id);

-- ── 10. hrbp_audit_log: UUID actor_id → INTEGER ───────────────
ALTER TABLE hrbp_audit_log DROP COLUMN IF EXISTS actor_id;
ALTER TABLE hrbp_audit_log ADD COLUMN actor_id INTEGER REFERENCES users(id);

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('id','name','role','phone','is_active','must_change_password')
ORDER BY column_name;
