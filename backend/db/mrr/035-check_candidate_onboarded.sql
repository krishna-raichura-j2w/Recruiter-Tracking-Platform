SELECT cws.*
FROM users u
JOIN candidate_work_flow_statuses cws
    ON u.id = cws.user_id
WHERE u.email = %(email)s
