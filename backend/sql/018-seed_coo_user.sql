INSERT INTO users (name, email, password_hash, role, is_active, must_change_password)
VALUES (:name, :email, :ph, 'coo', true, false)
ON CONFLICT (email) DO NOTHING
