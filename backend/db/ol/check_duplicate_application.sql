SELECT IF(COUNT(*) > 0, 'YES', 'NO') AS is_mapped
FROM applied_jobs aj
JOIN users u ON u.id = aj.user_id
WHERE u.email = %s
  AND aj.job_posting_id = %s
