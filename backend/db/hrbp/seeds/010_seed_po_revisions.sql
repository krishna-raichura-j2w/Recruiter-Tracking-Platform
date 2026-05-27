-- ============================================================
-- SEED: 010_seed_po_revisions.sql
-- Test data for hrbp_po_revisions — 10 rows across a mix of
-- consultants, statuses (approved / pending / rejected), and
-- revision scenarios (annual hike, market-gap, exit-risk, etc.)
-- Prerequisite: 007_seed_hrbp_consultants.sql
-- ============================================================

INSERT INTO hrbp_po_revisions (
    consultant_id, client_id, hrbp_id, bh_id,
    revised_at, old_po_rate, new_po_rate, hike_pct,
    ticket_id, ticket_number, status, notes,
    created_by_id
) VALUES
-- 1. Gaurav Khandelwal (rescue) — annual revision, approved
(1,  3, 1, 2, '2025-11-20', 403200.00, 436800.00,  8.33, NULL, NULL, 'approved',
 'Annual hike — client approved within 7 days. No pushback.',
 1),

-- 2. Pratik Ghosh (rescue) — market-gap flagged by HRBP, pending BH
(2,  3, 1, 2, '2026-03-10', 386400.00, 420000.00,  8.68, NULL, NULL, 'pending_approval',
 'Market rate gap identified — React/UI roles up ~12% YoY. BH review pending.',
 1),

-- 3. Srinivasan Manokaran (new_joiner) — first revision after 6-month probation, approved
(20, 3, 1, 2, '2026-04-20', 235000.00, 252000.00,  7.23, NULL, NULL, 'approved',
 'Post-probation hike confirmed; client agreed without revision.',
 1),

-- 4. Kavya K (new_joiner) — revision proposed, pending
(21, 3, 1, 2, '2026-05-01', 192000.00, 201600.00,  5.00, NULL, NULL, 'pending_approval',
 'HRBP raised AI Engineer market-rate adjustment; awaiting BH proposal to GEHC.',
 1),

-- 5. Neeraj Mehra (star) — large merit hike, approved
(26, 3, 1, 2, '2025-08-05', 420000.00, 453600.00,  8.00, NULL, NULL, 'approved',
 'Top-20 star hike; GEHC approved with 3-day turnaround.',
 1),

-- 6. Rintu Sahu (high_performer) — mid-year correction, approved
(37, 3, 1, 2, '2025-09-15', 360000.00, 386400.00,  7.33, NULL, NULL, 'approved',
 'Correction post client scope expansion — took on additional security audit scope.',
 1),

-- 7. Nalinikanta Sahoo (high_performer) — rejected by client (budget freeze)
(44, 3, 1, 2, '2026-02-12', 350000.00, 385000.00, 10.00, NULL, NULL, 'rejected',
 'Client declined revision citing H1 budget freeze. Attrition risk flagged.',
 1),

-- 8. Mahmadmustafa M Kaladagi (high_performer) — pending escalation
(46, 3, 1, 2, '2026-04-28', 320000.00, 336000.00,  5.00, NULL, NULL, 'pending_approval',
 'HRBP raised after 5% market movement in Angular roles. BH response awaited.',
 1),

-- 9. Praveen K (high_performer) — DevOps correction, approved
(47, 3, 1, 2, '2024-11-20', 273000.00, 302400.00, 10.77, NULL, NULL, 'approved',
 'Catch-up after 2 years at same rate; DevOps demand surge justified correction.',
 1),

-- 10. Prem Kumar M (watch_exit) — revision raised to retain, pending
(60, 3, 1, 2, '2026-04-15', 362208.00, 400000.00, 10.43, NULL, NULL, 'pending_approval',
 'Retention risk — consultant received competing offer. Urgent revision raised.',
 1)

ON CONFLICT DO NOTHING;

-- Verify
SELECT
    r.id,
    c.name          AS consultant,
    c.cohort,
    r.old_po_rate,
    r.new_po_rate,
    r.hike_pct,
    r.status,
    r.revised_at
FROM hrbp_po_revisions r
JOIN hrbp_consultants  c ON c.id = r.consultant_id
ORDER BY r.revised_at DESC;
