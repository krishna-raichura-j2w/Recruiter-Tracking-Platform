INSERT INTO pod_memberships (user_id, pod_lead_id)
VALUES (:uid, :plid)
ON CONFLICT (user_id, pod_lead_id) DO NOTHING
