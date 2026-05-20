INSERT INTO users (name, email, password_hash, role, is_active, must_change_password)
VALUES (:name, :email, :ph, 'bh', true, true)
ON CONFLICT (email) DO NOTHING
