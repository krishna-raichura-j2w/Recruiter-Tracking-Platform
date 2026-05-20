-- ============================================================
-- SEED: hrbp_kra_definitions
-- 4 rows — K1 through K4
-- Source: HRBP Playbook Section 1
-- ============================================================

INSERT INTO hrbp_kra_definitions
    (kra_code, name, description, what_you_own, target, revenue_consequence, control_level, sop_refs)
VALUES

('K1',
 'Targeted Exits',
 'Arrest exits before they happen. Retain first — always. Get a plan before engaging Priya. Fortnightly 1:1 for 3 months post-retention.',
 'Prevent voluntary exits. Every resignation must have a retention plan before any conversation. Fortnightly 1:1 mandatory for 3 months after any near-exit.',
 'Exit rate < 8/month. Zero exits without a documented plan.',
 'One Rs.3L PO = Rs.36L per year. Arresting 1 exit = Rs.36L saved.',
 'HIGH',
 ARRAY['SOP-2', 'SOP-7']),

('K2',
 'Contract Closure',
 'Flag contracts 4 MONTHS before end (not 90 days). Brief BH. Meet J2Wite at 4-month mark. Redeployment pipeline live by 2 months before.',
 'Flag every expiring PO 4 months before end date. Brief BH immediately. Keep redeployment pipeline active.',
 '100% of POs flagged 4 months ahead. Zero surprise closures.',
 'Every closure = PO lost. 4-month flag gives BH time to renew with client.',
 'LOW',
 ARRAY['SOP-3', 'SOP-4']),

('K3',
 'Consultant NPS',
 'Monthly check-ins. Quarterly NPS survey. Act on score below 7 within 7 days. Day-end report to Operations Head.',
 'Run monthly pulse surveys and quarterly deep dives. Act within 7 days if any NPS score is below 7. Send day-end E10 report daily.',
 'Survey response rate above 80%. Average NPS above 7.5.',
 'Low NPS = early exit signal. High NPS = referrals and upsell opportunity.',
 'HIGH',
 ARRAY['SOP-1', 'SOP-8']),

('K4',
 'BH and Customer Feedback',
 'Monthly BH call per account. 5-question template. Written feedback. Quarterly tier: Top 20% / Mid 60% / Bottom 20%.',
 'One BH call per account every month using Q3 template. Capture written feedback. Update performance tiers quarterly.',
 'Monthly call completed for every account. Tier updated every quarter.',
 'Bad feedback = exit risk and client loss. Good feedback = rate revision signal.',
 'HIGH',
 ARRAY['SOP-5', 'SOP-6'])

ON CONFLICT (kra_code) DO NOTHING;
