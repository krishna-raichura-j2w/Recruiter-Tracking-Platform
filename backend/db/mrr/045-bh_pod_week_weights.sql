-- Add weekly effort distribution weights to pod setups
-- Default: even split across 5 weeks (20% each)
ALTER TABLE bh_pod_setups
    ADD COLUMN IF NOT EXISTS week_weights JSONB NOT NULL DEFAULT '[20, 20, 20, 20, 20]';
