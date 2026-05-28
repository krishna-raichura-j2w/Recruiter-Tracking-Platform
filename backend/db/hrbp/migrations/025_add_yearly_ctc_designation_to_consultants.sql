ALTER TABLE hrbp_consultants
    ADD COLUMN IF NOT EXISTS yearly_ctc  NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS designation TEXT,
    ADD COLUMN IF NOT EXISTS margin      NUMERIC(14, 2);
