SELECT id,
       CONCAT(first_name, ' ', COALESCE(middle_name, ''), ' ', last_name) AS full_name,
       email, role_id, type, reporting_to,
       official_mail_id, mrr_candidate_id, created_at, confirmed_at
FROM users
WHERE email = %s
LIMIT 1
