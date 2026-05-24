-- ============================================================
-- MIGRATION: 013_add_priti_role.sql
-- Adds 'priti' as a named role in the users role constraint.
-- 'priti' represents the MD/Founder sign-off authority used in
-- SOP hierarchy definitions (persons_hierarchy JSONB).
-- ============================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
    role IN (
        'admin', 'kam', 'recruiter', 'delivery_lead', 'coo',
        'hrbp', 'bh', 'ops_head', 'priti'
    )
);
