SELECT
    cl.company_name                  AS client,
    aj.current_step                  AS step_id,
    cw.workflow_step                 AS step_label,
    COUNT(DISTINCT aj.id)            AS day_cnt
FROM  applied_jobs      AS aj
LEFT JOIN job_postings  AS jp ON aj.job_posting_id = jp.id
LEFT JOIN clients       AS cl ON jp.client_id      = cl.user_id
LEFT JOIN candidate_work_flows AS cw ON aj.current_step = cw.step_id
WHERE DATE(CONVERT_TZ(aj.created_at, '+00:00', '+05:30')) = %(sel_date)s
  AND aj.current_step > 6
  AND jp.id IS NOT NULL
  AND cl.id NOT IN (1, 2)
GROUP BY cl.company_name, aj.current_step, cw.workflow_step
ORDER BY cl.company_name, aj.current_step
