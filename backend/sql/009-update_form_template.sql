UPDATE form_templates
SET config = :c, label = :l,
    updated_at = NOW(), updated_by = :u
WHERE form_name = :n
