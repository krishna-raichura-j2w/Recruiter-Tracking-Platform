SELECT DISTINCT ON (user_id)
    user_id, action, detail, entity_type, entity_id, created_at
FROM audit_logs
ORDER BY user_id, created_at DESC
