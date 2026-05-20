SELECT
    cl.company_name                              AS client,
    aj.current_step                              AS step_id,
    COUNT(DISTINCT aj.id)                        AS total_cnt,
    COUNT(DISTINCT CASE
        WHEN aj.updated_at >= %(today_utc_start)s
         AND aj.updated_at  < %(tomorrow_utc_start)s
        THEN aj.id END)                          AS today_cnt,
    COUNT(DISTINCT CASE
        WHEN aj.updated_at >= %(cmp_utc_start)s
         AND aj.updated_at  < %(cmp_utc_end)s
        THEN aj.id END)                          AS compare_cnt
FROM  applied_jobs      AS aj
LEFT JOIN job_postings  AS jp ON aj.job_posting_id = jp.id
LEFT JOIN clients       AS cl ON jp.client_id      = cl.user_id
WHERE aj.current_step IN %(step_ids)s
  AND jp.id IS NOT NULL
  AND cl.id NOT IN (1, 2)
GROUP BY cl.company_name, aj.current_step
ORDER BY cl.company_name, aj.current_step
