-- ============================================================
-- SEED: 008_seed_sop9_rate_revision.sql
-- Adds SOP-9: Rate Revision to hrbp_sop_definitions.
-- Prerequisite: 003_seed_hrbp_sop_definitions.sql
-- ============================================================

INSERT INTO hrbp_sop_definitions
    (sop_type, number, name, description, trigger_source,
     kra_tags, control_level, email_templates,
     persons_hierarchy, steps_definition)
VALUES
(
  'SOP-9',
  'SOP-9',
  'Rate Revision',
  'Triggered when a consultant is due for a compensation review — '
  'either by calendar (3 months before last hike anniversary) or '
  'when HRBP identifies a market-rate gap. HRBP never proposes '
  'numbers to GEHC directly — that is BH territory.',
  'scheduler|hrbp_manual',
  ARRAY['K3'],
  'HIGH',
  ARRAY['E4'],
  '[
    {"order": 1, "role": "hrbp",     "label": "HRBP",           "sla_window": "0 to 3 days"},
    {"order": 2, "role": "bh",       "label": "Business Head",  "sla_window": "3 to 14 days"},
    {"order": 3, "role": "ops_head", "label": "Operations Head","sla_window": "14 to 30 days"},
    {"order": 4, "role": "ceo",    "label": "CEO",     "sla_window": "30+ days if stalled"}
  ]'::jsonb,
  '[
    {"number": 1,
     "action_label": "Identify revision need and prepare briefing note",
     "action_detail": "Run monthly: flag all consultants whose last hike date is 10+ months ago OR whose market rate has moved >15%. Prepare a note: name, current PO, last hike %, market rate, recommended % increase. No numbers shared with consultant yet.",
     "owner_role": "hrbp",
     "sla_working_hours": 24,
     "escalate_to_role": "bh",
     "email_template_id": null,
     "hard_gate": null,
     "kra_ref": "K3"},
    {"number": 2,
     "action_label": "Inform consultant — revision is in progress, no number promised",
     "action_detail": "Send E4 template. Say: I have raised your revision with Bollama. It is being worked on. No timeline or % to be mentioned. Log in tracker: Informed on [date].",
     "owner_role": "hrbp",
     "sla_working_hours": 8,
     "escalate_to_role": "bh",
     "email_template_id": "E4",
     "hard_gate": null,
     "kra_ref": "K3"},
    {"number": 3,
     "action_label": "BH evaluates and proposes to client",
     "action_detail": "BH reviews HRBP briefing note. BH proposes revised rate to GEHC — HRBP is NOT in this conversation. BH targets GEHC approval within 14 days.",
     "owner_role": "bh",
     "sla_working_hours": 112,
     "escalate_to_role": "ops_head",
     "email_template_id": null,
     "hard_gate": null,
     "kra_ref": "K3"},
    {"number": 4,
     "action_label": "HRBP gets status from BH and updates tracker",
     "action_detail": "If GEHC approved: update tracker, inform consultant via BH (BH delivers the news, not HRBP). If rejected: HRBP documents reason, sets a 3-month review flag.",
     "owner_role": "hrbp",
     "sla_working_hours": 8,
     "escalate_to_role": "ops_head",
     "email_template_id": null,
     "hard_gate": null,
     "kra_ref": "K3"},
    {"number": 5,
     "action_label": "If stalled beyond 30 days — escalate to Ops Head",
     "action_detail": "HRBP raises with Operations Head. Provide: consultant name, last hike date, days since raised with BH, current status. Ops Head decides whether to escalate further or reset timeline.",
     "owner_role": "ops_head",
     "sla_working_hours": 8,
     "escalate_to_role": "ceo",
     "email_template_id": null,
     "hard_gate": null,
     "kra_ref": "K3"},
    {"number": 6,
     "action_label": "Revision confirmed — update all systems and close",
     "action_detail": "ATS + tracker updated with new rate effective date. HRBP confirms with consultant: Your revision has been confirmed. BH confirms new PO with Finance. Ticket closed.",
     "owner_role": "hrbp",
     "sla_working_hours": 8,
     "escalate_to_role": "ops_head",
     "email_template_id": null,
     "hard_gate": null,
     "kra_ref": "K3"}
  ]'::jsonb
)
ON CONFLICT (sop_type) DO NOTHING;
