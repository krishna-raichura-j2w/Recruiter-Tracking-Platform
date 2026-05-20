-- ============================================================
-- MIGRATION: 004_restore_uuid_user_fks.sql
-- Migration 003 dropped all user FK columns trying to convert
-- them to INTEGER, but users.id is actually UUID in this
-- Supabase instance. This restores them all as UUID.
-- ============================================================

-- hrbp_clients
ALTER TABLE hrbp_clients ADD COLUMN IF NOT EXISTS bh_id   UUID REFERENCES users(id);
ALTER TABLE hrbp_clients ADD COLUMN IF NOT EXISTS hrbp_id UUID REFERENCES users(id);

-- hrbp_consultants (empty table — NOT NULL is safe without DEFAULT)
ALTER TABLE hrbp_consultants ADD COLUMN IF NOT EXISTS hrbp_id UUID NOT NULL REFERENCES users(id);

-- hrbp_incidents (empty table)
ALTER TABLE hrbp_incidents ADD COLUMN IF NOT EXISTS opened_by UUID NOT NULL REFERENCES users(id);

-- hrbp_sop_steps
ALTER TABLE hrbp_sop_steps ADD COLUMN IF NOT EXISTS owner_user_id     UUID REFERENCES users(id);
ALTER TABLE hrbp_sop_steps ADD COLUMN IF NOT EXISTS escalated_to_user UUID REFERENCES users(id);
ALTER TABLE hrbp_sop_steps ADD COLUMN IF NOT EXISTS completed_by      UUID REFERENCES users(id);

-- hrbp_signals (empty table)
ALTER TABLE hrbp_signals ADD COLUMN IF NOT EXISTS logged_by UUID NOT NULL REFERENCES users(id);

-- hrbp_routine_schedules (empty table)
ALTER TABLE hrbp_routine_schedules ADD COLUMN IF NOT EXISTS assigned_to  UUID NOT NULL REFERENCES users(id);
ALTER TABLE hrbp_routine_schedules ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id);

-- hrbp_audit_log
ALTER TABLE hrbp_audit_log ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id);

-- Verify all columns restored
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN (
    'hrbp_clients','hrbp_consultants','hrbp_incidents',
    'hrbp_sop_steps','hrbp_signals','hrbp_routine_schedules','hrbp_audit_log'
)
AND column_name IN (
    'bh_id','hrbp_id','opened_by','owner_user_id',
    'escalated_to_user','completed_by','logged_by',
    'assigned_to','actor_id'
)
ORDER BY table_name, column_name;
