SELECT
    aj.id              AS applied_job_id,
    aj.job_posting_id,
    jp.title           AS job_title,
    cl.company_name    AS client_name,
    aj.status          AS application_status,
    aj.current_step,
    cwf.workflow_step  AS step_name,
    cwf.stage          AS step_stage,
    aj.self_applied,
    aj.note,
    aj.created_at,
    aj.updated_at
FROM applied_jobs aj
LEFT JOIN job_postings jp          ON jp.id = aj.job_posting_id
LEFT JOIN clients cl               ON cl.user_id = jp.client_id
LEFT JOIN candidate_work_flows cwf ON cwf.step_id = aj.current_step
WHERE aj.user_id = %s
  AND aj.job_posting_id = %s
LIMIT 1
