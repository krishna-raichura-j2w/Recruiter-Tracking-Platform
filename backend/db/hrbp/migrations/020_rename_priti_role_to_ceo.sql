-- MIGRATION: 020_rename_priti_role_to_ceo.sql
-- Renames the 'priti' role to 'ceo' in the users table.

BEGIN;

-- 1. Drop the existing role CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. Re-add the constraint with 'ceo' replacing 'priti'
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('hrbp', 'bh', 'admin', 'ops_head', 'coo', 'ceo'));

-- 3. Migrate any existing users who had role = 'priti'
UPDATE users SET role = 'ceo' WHERE role = 'priti';

COMMIT;
