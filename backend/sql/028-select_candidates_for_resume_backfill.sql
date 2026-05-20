SELECT id, resume, resume_data FROM candidates
WHERE (resume IS NOT NULL AND resume <> 'None' AND resume LIKE '%/%')
   OR (resume_data IS NOT NULL AND resume_data <> 'None' AND resume_data LIKE '%/%')
