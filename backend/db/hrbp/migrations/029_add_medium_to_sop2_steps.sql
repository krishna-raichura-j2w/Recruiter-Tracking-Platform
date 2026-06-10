-- ============================================================
-- Migration 029: Add medium + medium_config to SOP-2 steps
-- Voluntary Resignation — each step now declares what UI action
-- the responsible role must perform to complete it.
-- ============================================================

UPDATE hrbp_sop_definitions
SET steps_definition = '[
  {
    "number": 1,
    "action_label": "Capture resignation — do NOT confirm LWD",
    "action_detail": "Log within 1 hr. Acknowledge receipt only. Do NOT confirm LWD. Send E3 template.",
    "owner_role": "hrbp",
    "sla_working_hours": 1,
    "escalate_to_role": "bh",
    "email_template_id": "E3",
    "hard_gate": "BLOCK_LWD_CONFIRMATION",
    "kra_ref": "K1",
    "medium": "email",
    "medium_config": {
      "template_id": "E3",
      "instruction": "Send the E3 acknowledgement template to the consultant. Do NOT mention or confirm Last Working Day."
    }
  },
  {
    "number": 2,
    "action_label": "Prepare comprehensive retention plan",
    "action_detail": "Assess tier, PO, reason, retention feasibility. Document before any conversation. No engagement without a plan.",
    "owner_role": "hrbp",
    "sla_working_hours": 2,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K1",
    "medium": "document",
    "medium_config": {
      "instruction": "Upload the retention plan document before initiating any conversation with the consultant.",
      "accepted_formats": ["pdf", "docx"],
      "max_files": 1
    }
  },
  {
    "number": 3,
    "action_label": "Same-day 1:1 within 4 hours",
    "action_detail": "Listen 80%, talk 20%. Capture: CTC, offer in hand, expected CTC, willing to stay?",
    "owner_role": "hrbp",
    "sla_working_hours": 4,
    "escalate_to_role": "bh",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K1",
    "medium": "form",
    "medium_config": {
      "instruction": "Complete the 1:1 with the consultant and fill in the details below.",
      "form_schema": [
        {"key": "current_ctc",           "label": "Current CTC (₹)",        "type": "number",   "required": true},
        {"key": "offer_in_hand",         "label": "Offer in Hand (₹)",       "type": "number",   "required": false},
        {"key": "offer_company",         "label": "Offer from (Company)",    "type": "text",     "required": false},
        {"key": "expected_ctc",          "label": "Expected CTC (₹)",        "type": "number",   "required": true},
        {"key": "willing_to_stay",       "label": "Willing to Stay?",        "type": "boolean",  "required": true},
        {"key": "retention_feasibility", "label": "Retention Feasibility Notes", "type": "textarea", "required": false}
      ]
    }
  },
  {
    "number": 4,
    "action_label": "Classify risk level",
    "action_detail": "RED: Top 20% and PO above Rs.3L. AMBER: Mid 60%. GREEN: Bottom 20%.",
    "owner_role": "hrbp",
    "sla_working_hours": 8,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K1",
    "medium": "rag",
    "medium_config": {
      "instruction": "Classify the consultant based on performance tier and PO value.",
      "rag_options": [
        {"value": "red",   "label": "RED",   "description": "Top 20% performer and PO above ₹3L — highest retention priority"},
        {"value": "amber", "label": "AMBER", "description": "Mid 60% — moderate retention priority"},
        {"value": "green", "label": "GREEN", "description": "Bottom 20% — lower retention priority"}
      ]
    }
  },
  {
    "number": 5,
    "action_label": "Brief BH with full summary",
    "action_detail": "Summary to BH within 24 hrs: name, tier, PO, reason, offer in hand, HRBP assessment.",
    "owner_role": "hrbp",
    "sla_working_hours": 24,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K1",
    "medium": "document_ai_summary",
    "medium_config": {
      "instruction": "Upload the BH briefing document. An AI summary will be generated for quick visibility.",
      "accepted_formats": ["pdf", "docx"],
      "max_files": 1
    }
  },
  {
    "number": 6,
    "action_label": "BH makes retention decision",
    "action_detail": "BH evaluates within 48 hrs. Finance checks comp. Decision in 5 working days.",
    "owner_role": "bh",
    "sla_working_hours": 48,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K1",
    "medium": "comment",
    "medium_config": {
      "instruction": "Document the retention decision and the rationale below.",
      "placeholder": "State the retention decision (RETAIN / EXIT) and the reasoning behind it..."
    }
  },
  {
    "number": 7,
    "action_label": "If RETAIN — confirm and get written withdrawal",
    "action_detail": "Offer via BH not HRBP. Written withdrawal from J2Wite mandatory. Update tracker. Fortnightly 1:1 for 3 months.",
    "owner_role": "hrbp",
    "sla_working_hours": 24,
    "escalate_to_role": "ops_head",
    "email_template_id": "E8",
    "hard_gate": "REQUIRE_WRITTEN_WITHDRAWAL",
    "kra_ref": "K1",
    "medium": "comment",
    "medium_config": {
      "instruction": "Confirm written withdrawal has been received and logged. Add the tracker update notes.",
      "placeholder": "Confirm written withdrawal received. Note the retention offer details and next 1:1 schedule..."
    }
  },
  {
    "number": 8,
    "action_label": "If EXIT — confirm LWD and start redeployment",
    "action_detail": "Confirm LWD only after BH and client align. KT plan. Circulate CV to all BHs.",
    "owner_role": "hrbp",
    "sla_working_hours": 168,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": "REQUIRE_BH_AND_CLIENT_SIGNOFF",
    "kra_ref": "K1",
    "medium": "comment",
    "medium_config": {
      "instruction": "Confirm LWD, KT plan details, and CV circulation status.",
      "placeholder": "Confirmed LWD: [date]. KT plan: [details]. CV circulated to BHs: [list]..."
    }
  },
  {
    "number": 9,
    "action_label": "Post-retention watch — 90 days mandatory",
    "action_detail": "Fortnightly 1:1 and monthly BH check mandatory for 90 days. Retained J2Wite is vulnerable.",
    "owner_role": "hrbp",
    "sla_working_hours": 2160,
    "escalate_to_role": "ops_head",
    "email_template_id": "E1",
    "hard_gate": null,
    "kra_ref": "K1",
    "medium": "comment",
    "medium_config": {
      "instruction": "Log the 90-day watch progress. Record each fortnightly 1:1 and monthly BH check.",
      "placeholder": "Date of last 1:1: [date]. Consultant sentiment: [notes]. BH check status: [notes]..."
    }
  },
  {
    "number": 10,
    "action_label": "Exit interview — last week of notice",
    "action_detail": "Capture real reason. Update dashboard. Must be completed before last working day.",
    "owner_role": "hrbp",
    "sla_working_hours": 168,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K1",
    "medium": "status_update",
    "medium_config": {
      "instruction": "Mark the exit interview status and capture the real reason for leaving.",
      "status_options": [
        {"value": "completed",     "label": "Completed — real reason captured"},
        {"value": "scheduled",     "label": "Scheduled — awaiting completion"},
        {"value": "not_reachable", "label": "Consultant not reachable"},
        {"value": "waived",        "label": "Waived (client/time constraint)"}
      ],
      "extra_fields": [
        {"key": "real_reason", "label": "Real Reason for Leaving", "type": "textarea", "required": true},
        {"key": "exit_date",   "label": "Last Working Day",         "type": "date",     "required": true}
      ]
    }
  }
]'::jsonb
WHERE sop_type = 'SOP-2';

-- Fix persons_hierarchy: remove OPS_HEAD and COO — they are escalation targets only.
-- Only HRBP and BH are actual step owners in this SOP.
UPDATE hrbp_sop_definitions
SET persons_hierarchy = '[
  {"order": 1, "role": "hrbp", "label": "HRBP",          "sla_window": "0 to 168 hrs (steps 1–5)"},
  {"order": 2, "role": "bh",   "label": "Business Head",  "sla_window": "48 hrs (step 6)"},
  {"order": 3, "role": "hrbp", "label": "HRBP (Post-Decision)", "sla_window": "post-decision (steps 7–10)"}
]'::jsonb
WHERE sop_type = 'SOP-2';
