-- ============================================================
-- SEED: users (additional HRBP/BH) + hrbp_clients
-- Prerequisite: 000_create_all_localhost.sql
-- ============================================================

-- Users (no id column — SERIAL auto-assigns)
INSERT INTO users (name, email, password_hash, role, is_active, must_change_password)
VALUES
  ('Priya Sharma', 'priya.sharma@j2w.com', crypt('Hrbp@1234', gen_salt('bf')), 'hrbp', true, false),
  ('Arjun Mehta',  'arjun.mehta@j2w.com',  crypt('Hrbp@1234', gen_salt('bf')), 'hrbp', true, false),
  ('Sneha Kapoor', 'sneha.kapoor@j2w.com',  crypt('Hrbp@1234', gen_salt('bf')), 'bh',  true, false),
  ('Ravi Nair',    'ravi.nair@j2w.com',     crypt('Hrbp@1234', gen_salt('bf')), 'bh',  true, false)
ON CONFLICT (email) DO NOTHING;

-- Clients (no id column — GENERATED ALWAYS AS IDENTITY)
INSERT INTO hrbp_clients (name, industry, hrbp_id, bh_id, is_active)
VALUES
  (
    'TechCorp Solutions', 'IT Services',
    (SELECT id FROM users WHERE email = 'priya.sharma@j2w.com'),
    (SELECT id FROM users WHERE email = 'sneha.kapoor@j2w.com'),
    true
  ),
  (
    'FinServe Global', 'Banking & Finance',
    (SELECT id FROM users WHERE email = 'arjun.mehta@j2w.com'),
    (SELECT id FROM users WHERE email = 'ravi.nair@j2w.com'),
    true
  )
ON CONFLICT DO NOTHING;

-- Verify
SELECT id, name, email, role FROM users
WHERE email IN ('priya.sharma@j2w.com','arjun.mehta@j2w.com','sneha.kapoor@j2w.com','ravi.nair@j2w.com')
ORDER BY role, name;

SELECT id, name, industry, hrbp_id, bh_id, is_active FROM hrbp_clients
WHERE name IN ('TechCorp Solutions','FinServe Global');
