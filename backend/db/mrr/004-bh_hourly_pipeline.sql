-- Hourly pipeline events per client for a single IST day.
-- One row per (client, step_id, hour_ist) with COUNT of distinct applied_jobs.
-- Filters on aj.updated_at (the step-transition timestamp) in IST.
SELECT
    cl.company_name                                            AS client,
    aj.current_step                                            AS step_id,
    HOUR(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30'))        AS hour_ist,
    COUNT(DISTINCT aj.id)                                      AS cnt
FROM  applied_jobs      AS aj
LEFT JOIN job_postings  AS jp ON aj.job_posting_id = jp.id
LEFT JOIN clients       AS cl ON jp.client_id      = cl.user_id
WHERE DATE(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30')) = %(sel_date)s
  AND aj.current_step IN (7, 11, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 47, 33, 41, 44, 54)
  AND jp.id IS NOT NULL
  AND cl.id NOT IN (1, 2)
GROUP BY cl.company_name, aj.current_step, hour_ist
ORDER BY cl.company_name, hour_ist, aj.current_step
