-- ============================================================
-- MIGRATION: 012_add_po_risk_to_consultants.sql
-- Adds optional po_risk override column to hrbp_consultants.
-- When set, this overrides the live-calculated PO risk on tickets.
-- ============================================================

ALTER TABLE hrbp_consultants
    ADD COLUMN IF NOT EXISTS po_risk NUMERIC(14, 2);

COMMENT ON COLUMN hrbp_consultants.po_risk IS
    'Optional manual override for PO-at-risk amount (INR). '
    'If NULL, the value is computed live as: '
    'remaining_months_to_po_end_date × monthly_po.';
