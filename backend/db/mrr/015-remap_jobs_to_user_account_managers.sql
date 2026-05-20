UPDATE jobs j
   SET account_manager_id = u.id
  FROM account_managers am
  JOIN users u ON LOWER(u.email) = LOWER(am.email) AND u.role = 'bh'
 WHERE j.account_manager_id = am.id
   AND am.email IS NOT NULL AND am.email <> ''
