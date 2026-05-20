CREATE TABLE IF NOT EXISTS form_templates (
    id          SERIAL PRIMARY KEY,
    form_name   VARCHAR(80) UNIQUE NOT NULL,
    label       VARCHAR(120),
    config      TEXT NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by  VARCHAR(120)
)
