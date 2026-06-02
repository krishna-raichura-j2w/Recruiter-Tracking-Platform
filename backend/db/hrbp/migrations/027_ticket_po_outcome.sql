-- Add po_outcome to tickets (set on close: 'retained' | 'loss' | NULL = skipped)
ALTER TABLE hrbp_tickets
  ADD COLUMN IF NOT EXISTS po_outcome TEXT
    CHECK (po_outcome IN ('retained', 'loss'));

-- Extend hrbp_po_revisions for PO Retained close-time snapshots
ALTER TABLE hrbp_po_revisions
  ADD COLUMN IF NOT EXISTS revision_type TEXT NOT NULL DEFAULT 'rate_change'
    CHECK (revision_type IN ('rate_change', 'po_retained'));
ALTER TABLE hrbp_po_revisions
  ADD COLUMN IF NOT EXISTS new_po_end_date DATE;
ALTER TABLE hrbp_po_revisions
  ADD COLUMN IF NOT EXISTS new_margin      NUMERIC(14, 2);
ALTER TABLE hrbp_po_revisions
  ADD COLUMN IF NOT EXISTS new_ctc         NUMERIC(14, 2);
