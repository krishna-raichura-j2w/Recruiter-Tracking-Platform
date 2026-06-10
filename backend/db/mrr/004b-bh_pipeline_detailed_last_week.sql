-- BH Hourly Pipeline -- DETAILED view, last 7 IST days (rolling window).
-- INSPECTION ONLY. Not loaded by the backend at runtime.
-- Each row = one applied_jobs record that transitioned into one of the
-- tracked steps during the last 7 IST days.
--
-- Step buckets (verified against candidate_work_flows table):
--   Client Submit   : 7                                          (Client Submit)
--   L1 Interview    : 9, 10, 11, 12, 13                          (L1 scheduling + outcomes)
--                       9  Schedule L1   / 10 Reschedule L1
--                       11 L1 No Show    / 12 L1 Reject   / 13 L1 Select
--   L2/L3 Interview : 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 58 (L2 + L3 scheduling + outcomes)
--                       14 Schedule L2   / 15 Reschedule L2
--                       16 L2 No Show    / 17 L2 Reject   / 18 L2 Select
--                       19 Schedule L3   / 20 Reschedule L3
--                       21 L3 No Show    / 22 L3 Reject   / 23 L3 Select
--                       58 Schedule L4 (proxy for L3 cleared)
--   Selections      : 47, 33                                     (client confirmed select OR offer accepted)
--                       47 Confirm Final Select / 33 Offer Accepted
--   Onboarded       : 44                                         (candidate actually joined)

SELECT
    DATE(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30'))                              AS event_date_ist,
    HOUR(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30'))                              AS event_hour_ist,
    DATE_FORMAT(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30'), '%Y-%m-%d %H:%i')     AS moved_at_ist,
    DATE_FORMAT(CONVERT_TZ(aj.created_at, '+00:00', '+05:30'), '%Y-%m-%d %H:%i')     AS applied_at_ist,
    cl.company_name                                                                  AS client,
    cl.id                                                                            AS client_id,
    aj.current_step                                                                  AS step_id,
    cwf.workflow_step                                                                AS step_label,
    CASE
        WHEN aj.current_step = 7                                                       THEN 'Client Submit'
        WHEN aj.current_step IN (9, 10, 11, 12, 13)                                    THEN 'L1 Interview'
        WHEN aj.current_step IN (14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 58)           THEN 'L2/L3 Interview'
        WHEN aj.current_step IN (47, 33)                                               THEN 'Selections'
        WHEN aj.current_step = 44                                                      THEN 'Onboarded'
    END                                                                              AS bucket,
    aj.id                                                                            AS applied_job_id,
    jp.id                                                                            AS job_posting_id,
    jp.title                                                                         AS job_title,
    TRIM(CONCAT(IFNULL(us.first_name, ''), ' ', IFNULL(us.middle_name, ''), ' ', IFNULL(us.last_name, '')))  AS candidate,
    us.email                                                                         AS candidate_email,
    ud.contact_phone                                                                 AS candidate_phone,
    TRIM(CONCAT(IFNULL(ur.first_name, ''), ' ', IFNULL(ur.last_name, '')))           AS recruiter,
    ur.email                                                                         AS recruiter_email
FROM      applied_jobs            aj
LEFT JOIN job_postings            jp  ON jp.id       = aj.job_posting_id
LEFT JOIN clients                 cl  ON cl.user_id  = jp.client_id
LEFT JOIN candidate_work_flows    cwf ON cwf.step_id = aj.current_step
LEFT JOIN users                   us  ON us.id       = aj.user_id
LEFT JOIN user_details            ud  ON ud.user_id  = us.id
LEFT JOIN users                   ur  ON ur.id       = aj.applied_by_id
WHERE DATE(CONVERT_TZ(aj.updated_at, '+00:00', '+05:30'))
        BETWEEN DATE_SUB(DATE(CONVERT_TZ(NOW(), '+00:00', '+05:30')), INTERVAL 6 DAY)
        AND     DATE(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
  AND aj.current_step IN (7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 33, 44, 47, 58)
  AND jp.id IS NOT NULL
  AND cl.id NOT IN (1, 2)
ORDER BY event_date_ist DESC, cl.company_name ASC, aj.current_step ASC, aj.updated_at ASC;
