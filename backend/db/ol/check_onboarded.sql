SELECT IF(COUNT(*) > 0, 'YES', 'NO') AS is_present
FROM offer_letters ol
JOIN clients c ON c.user_id = ol.client_id
JOIN users   u ON u.id = ol.candidate_id
WHERE u.email = %s
  AND ol.status = 5
  AND c.id NOT IN (1, 2)
  AND ol.employee_type != 0
