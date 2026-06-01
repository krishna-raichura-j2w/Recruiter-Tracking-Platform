-- Store custom working day selections per pod setup
ALTER TABLE bh_pod_setups
    ADD COLUMN IF NOT EXISTS custom_working_days JSONB;
