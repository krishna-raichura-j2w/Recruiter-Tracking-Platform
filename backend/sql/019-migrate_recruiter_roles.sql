UPDATE users SET role='recruiter', password_hash=:h WHERE role IN ('caller','sourcing_partner')
