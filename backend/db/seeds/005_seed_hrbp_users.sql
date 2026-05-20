-- ============================================================
-- SEED: users (HRBP system roles)
-- Prerequisite: run 002_add_hrbp_roles_to_users.sql first
-- ============================================================

INSERT INTO users (name, email, password_hash, role, phone, is_active, must_change_password)
VALUES
('Sara Thomas',  'sara.thomas@joulestowatts.com',  crypt('hrbp@123',  gen_salt('bf', 10)), 'hrbp',     '+919876543210', true, true),
('Bollama',      'bollama@joulestowatts.com',       crypt('bh@123',    gen_salt('bf', 10)), 'bh',       '+919876543211', true, true),
('Saroj Kumar',  'saroj.kumar@joulestowatts.com',   crypt('ops@123',   gen_salt('bf', 10)), 'ops_head', '+919876543212', true, true),
('Priya Mohan',  'priyamohan@joulestowatts.com',    crypt('joules@123',gen_salt('bf', 10)), 'coo',      '+919876543213', true, false),
('Priti Sawant', 'priti.sawant@joulestowatts.com',  crypt('joules@123',gen_salt('bf', 10)), 'coo',      '+919876543214', true, false)
ON CONFLICT (email) DO UPDATE
    SET role  = EXCLUDED.role,
        phone = EXCLUDED.phone;

-- Verify
SELECT id, name, email, role, phone FROM users
WHERE email IN (
    'sara.thomas@joulestowatts.com',
    'bollama@joulestowatts.com',
    'saroj.kumar@joulestowatts.com',
    'priyamohan@joulestowatts.com',
    'priti.sawant@joulestowatts.com'
)
ORDER BY role;
