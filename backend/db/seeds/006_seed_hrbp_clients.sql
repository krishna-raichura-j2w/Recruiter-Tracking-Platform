-- ============================================================
-- SEED: hrbp_clients
-- Prerequisite: run 003_fix_hrbp_user_fks.sql and 005_seed_hrbp_users.sql first
-- Uses DELETE + INSERT so bh_id/hrbp_id are always populated with
-- real integer user IDs on every run.
-- ============================================================

DELETE FROM hrbp_clients
WHERE name IN ('GE Healthcare','Deloitte','Boston Scientific','Accenture');

INSERT INTO hrbp_clients (name, industry, bh_id, hrbp_id, is_active)
VALUES
(
    'GE Healthcare',
    'Medical Devices',
    (SELECT id FROM users WHERE email = 'bollama@joulestowatts.com'),
    (SELECT id FROM users WHERE email = 'sara.thomas@joulestowatts.com'),
    true
),
(
    'Deloitte',
    'Consulting',
    (SELECT id FROM users WHERE email = 'bollama@joulestowatts.com'),
    (SELECT id FROM users WHERE email = 'sara.thomas@joulestowatts.com'),
    false
),
(
    'Boston Scientific',
    'Medical Devices',
    (SELECT id FROM users WHERE email = 'bollama@joulestowatts.com'),
    (SELECT id FROM users WHERE email = 'sara.thomas@joulestowatts.com'),
    false
),
(
    'Accenture',
    'IT Services',
    (SELECT id FROM users WHERE email = 'bollama@joulestowatts.com'),
    (SELECT id FROM users WHERE email = 'sara.thomas@joulestowatts.com'),
    false
);

-- Verify
SELECT id, name, industry, bh_id, hrbp_id, is_active FROM hrbp_clients ORDER BY name;
