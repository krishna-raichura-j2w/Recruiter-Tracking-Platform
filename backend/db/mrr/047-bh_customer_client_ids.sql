ALTER TABLE bh_customer_targets
    ADD COLUMN IF NOT EXISTS client_ids JSONB;
