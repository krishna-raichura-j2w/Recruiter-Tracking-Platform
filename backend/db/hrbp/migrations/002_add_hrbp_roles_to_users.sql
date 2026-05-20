-- ============================================================
-- MIGRATION: 002_add_hrbp_roles_to_users.sql
-- Extends users.role constraint to include HRBP system roles
-- and adds phone column if it doesn't exist.
-- Run BEFORE seeding hrbp users.
-- ============================================================

-- Drop and re-add the role CHECK to include new roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
    role IN (
        'admin', 'kam', 'recruiter', 'delivery_lead', 'coo',
        'hrbp', 'bh', 'ops_head'
    )
);

-- Add phone column if not already present
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
