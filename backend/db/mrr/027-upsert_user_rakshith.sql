INSERT INTO users (name, email, password_hash, role, recruiter_type, pod_lead_id, is_active)
VALUES ('Rakshith B', 'rakshith@j2w.com', :ph, 'recruiter', 'caller', 3, true)
ON CONFLICT (email) DO UPDATE SET recruiter_type='caller', pod_lead_id=3
