SELECT
    c.id           AS mrr_id,
    c.full_name    AS name,
    c.email,
    c.mobile,
    c.status       AS mrr_status,
    c.sourced_at,
    j.id           AS mrr_job_id,
    j.job_id       AS ol_job_id,
    j.client_name,
    j.role_title,
    r.name         AS recruiter_name,
    s.current_stage,
    s.submitted_at
FROM candidates c
JOIN jobs j        ON j.id = c.job_id
LEFT JOIN users r  ON r.id = c.sourced_by_id
LEFT JOIN submissions s ON s.candidate_id = c.id
WHERE c.email IS NOT NULL AND c.email != ''
ORDER BY c.full_name
