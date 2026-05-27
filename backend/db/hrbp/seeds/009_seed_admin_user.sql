-- ============================================================
-- SEED: admin user for HRBP system
-- ============================================================

INSERT INTO users (name, email, password_hash, role, is_active, must_change_password)
VALUES (
    'HRBP Admin',
    'admin_hrbp@joulestowatts.com',
    crypt('Admin@123', gen_salt('bf', 10)),
    'admin',
    true,
    true
)
ON CONFLICT (email) DO UPDATE
    SET role               = 'admin',
        is_active          = true,
        must_change_password = true;

-- Verify
SELECT id, name, email, role, is_active, must_change_password
FROM users
WHERE email = 'admin_hrbp@joulestowatts.com';
