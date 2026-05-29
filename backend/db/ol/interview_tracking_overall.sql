SELECT
    CONCAT_WS(' ', us.first_name, us.middle_name, us.last_name) AS candidate,
    us.email                                                    AS email,
    ud.contact_phone                                            AS contact,
    cwf.workflow_step                                           AS workflow_step,
    jp.id                                                       AS job_id,
    CONCAT(ur.first_name, ' ', ur.last_name)                    AS recruiter,
    ur.email                                                    AS recruiter_email,
    DATE_FORMAT(vs.interview_date, '%%Y-%%m-%%d')               AS interview_date,
    TIME_FORMAT(STR_TO_DATE(vs.interview_time, '%%h:%%i %%p'), '%%H:%%i') AS interview_time,
    cl.company_name                                             AS company_name,
    cl.id                                                       AS client_id
FROM offerletter.validation_screens AS vs
LEFT JOIN offerletter.users               AS us  ON us.id  = vs.applied_candidate_id
LEFT JOIN offerletter.user_details        AS ud  ON ud.user_id = us.id
LEFT JOIN offerletter.candidate_work_flows AS cwf ON cwf.step_id = vs.candidate_work_flow_step
LEFT JOIN offerletter.job_postings        AS jp  ON jp.id  = vs.applied_candidate_for_job_id
LEFT JOIN offerletter.applied_jobs        AS aj  ON aj.job_posting_id = jp.id AND aj.user_id = us.id
LEFT JOIN offerletter.users               AS ur  ON ur.id  = aj.applied_by_id
LEFT JOIN offerletter.clients             AS cl  ON cl.user_id = jp.client_id
WHERE vs.interview_date BETWEEN %s AND %s
  AND jp.id IS NOT NULL
  AND cl.id NOT IN (1, 2)
ORDER BY vs.interview_date ASC, STR_TO_DATE(vs.interview_time, '%%h:%%i %%p') ASC
