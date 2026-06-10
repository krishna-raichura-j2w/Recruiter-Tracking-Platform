-- Migration 031: Add medium + medium_config to SOP-4 steps
-- Conversion and NOC Request — restructured to 9 steps:
--   Step 7 (CEO review) is newly inserted; old steps 7→8, 8→9.
-- persons_hierarchy updated to reflect true per-role ownership chain.
-- ============================================================

UPDATE hrbp_sop_definitions
SET steps_definition = '[
  {
    "number": 1,
    "action_label": "Alert HRBP & Account Manager same day",
    "action_detail": "BH or HRBP hears conversion intent. Alert both HRBP and Account Manager the same day. Do NOT discuss with J2Wite or client yet.",
    "owner_role": "bh",
    "sla_working_hours": 8,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K2",
    "medium": "email",
    "medium_config": {
      "instruction": "Send an internal alert email to the HRBP and Account Manager about the conversion intent. Do NOT loop in the consultant or client at this stage."
    }
  },
  {
    "number": 2,
    "action_label": "Check MSA eligibility — min tenure clause",
    "action_detail": "Verify MSA clause: minimum tenure for conversion is 12 to 24 months. Check with Invoice Team.",
    "owner_role": "hrbp",
    "sla_working_hours": 24,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K2",
    "medium": "status_update",
    "medium_config": {
      "instruction": "Check the MSA eligibility clause with the Invoice Team and update the status below.",
      "status_options": [
        {"value": "eligible",      "label": "Eligible — MSA clause satisfied"},
        {"value": "not_eligible",  "label": "Not Eligible — MSA clause not met"},
        {"value": "pending_check", "label": "Pending — checking with Invoice Team"}
      ],
      "extra_fields": [
        {"key": "tenure_months", "label": "Consultant Tenure (months)", "type": "number",   "required": true},
        {"key": "msa_notes",     "label": "MSA Eligibility Notes",       "type": "textarea", "required": false}
      ]
    }
  },
  {
    "number": 3,
    "action_label": "Connect with J2Wite within 48 hours",
    "action_detail": "Understand intent. Listen only — do NOT influence decision.",
    "owner_role": "hrbp",
    "sla_working_hours": 48,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K2",
    "medium": "comment",
    "medium_config": {
      "instruction": "Connect with the consultant and listen to their intent. Do NOT influence the decision. Log the conversation summary below.",
      "placeholder": "Describe the conversation: consultant intent, concerns raised, sentiment, any retention signals..."
    }
  },
  {
    "number": 4,
    "action_label": "BH evaluates counter-offer within 48 hours",
    "action_detail": "If retention possible, BH makes offer within 48 hrs.",
    "owner_role": "bh",
    "sla_working_hours": 48,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K2",
    "medium": "comment",
    "medium_config": {
      "instruction": "BH to evaluate if a counter-offer for retention is feasible. Document the evaluation and outcome below.",
      "placeholder": "Is retention possible? What offer was evaluated or made? Final decision: proceed with conversion or attempt retention?..."
    }
  },
  {
    "number": 5,
    "action_label": "Client submits NOC request in standard format",
    "action_detail": "Format: Consultant name, Employee ID, WO Number, PO End Date, Proposed Conversion Date.",
    "owner_role": "bh",
    "sla_working_hours": 24,
    "escalate_to_role": "ops_head",
    "email_template_id": "E6A",
    "hard_gate": null,
    "kra_ref": "K2",
    "medium": "document",
    "medium_config": {
      "instruction": "Receive the NOC request from the client in the standard format and upload it here. Required fields: Consultant name, Employee ID, WO Number, PO End Date, Proposed Conversion Date.",
      "accepted_formats": ["pdf", "docx"],
      "max_files": 1
    }
  },
  {
    "number": 6,
    "action_label": "BH submits to Priti — fee, MSA, PO impact",
    "action_detail": "BH submits to Priti with conversion fee, MSA clause, PO impact details. Priti responds within 24 working hours.",
    "owner_role": "bh",
    "sla_working_hours": 24,
    "escalate_to_role": "coo",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K2",
    "medium": "document",
    "medium_config": {
      "instruction": "Prepare and upload the submission document for Priti (COO) covering: conversion/absorption fee (~8.5%), MSA clause reference, and PO financial impact.",
      "accepted_formats": ["pdf", "docx"],
      "max_files": 2
    }
  },
  {
    "number": 7,
    "action_label": "CEO reviews and approves or rejects the NOC",
    "action_detail": "CEO reviews the NOC request. Approves or rejects. Decision must be documented.",
    "owner_role": "ceo",
    "sla_working_hours": 24,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K2",
    "medium": "status_update",
    "medium_config": {
      "instruction": "Review the NOC request and provide your decision. Approval is required before the NOC can be issued.",
      "status_options": [
        {"value": "approved",          "label": "Approved — NOC granted"},
        {"value": "rejected",          "label": "Rejected — NOC denied"},
        {"value": "more_info_needed",  "label": "More Information Needed"}
      ],
      "extra_fields": [
        {"key": "decision_comments", "label": "Decision Comments / Reasoning", "type": "textarea", "required": true}
      ]
    }
  },
  {
    "number": 8,
    "action_label": "NOC issued after Priti approval — notify Invoice Team",
    "action_detail": "BH issues NOC via E6A or E6B template. Invoice Team notified.",
    "owner_role": "bh",
    "sla_working_hours": 24,
    "escalate_to_role": "ops_head",
    "email_template_id": "E6A",
    "hard_gate": "REQUIRE_PRITI_APPROVAL",
    "kra_ref": "K2",
    "medium": "email",
    "medium_config": {
      "instruction": "CEO/Priti has approved the NOC. Issue the NOC via E6A or E6B template and send to the Invoice Team.",
      "template_id": "E6A"
    }
  },
  {
    "number": 9,
    "action_label": "Clean exit — LWD confirmed, exit interview done",
    "action_detail": "HRBP confirms LWD. Exit interview. Update tracker: reason = Conversion to Client.",
    "owner_role": "hrbp",
    "sla_working_hours": 8,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K2",
    "medium": "status_update",
    "medium_config": {
      "instruction": "Confirm the Last Working Day and complete the exit interview. Update the tracker with reason = Conversion to Client.",
      "status_options": [
        {"value": "lwd_confirmed",       "label": "LWD Confirmed with consultant and client"},
        {"value": "exit_interview_done", "label": "Exit Interview Completed"},
        {"value": "tracker_updated",     "label": "Tracker Updated — reason: Conversion to Client"}
      ],
      "extra_fields": [
        {"key": "last_working_day",       "label": "Last Working Day",          "type": "date",     "required": true},
        {"key": "exit_interview_notes",   "label": "Exit Interview Notes",      "type": "textarea", "required": true}
      ]
    }
  }
]'::jsonb
WHERE sop_type = 'SOP-4';

-- Update persons_hierarchy to reflect true ownership chain (6 consecutive role groups)
UPDATE hrbp_sop_definitions
SET persons_hierarchy = '[
  {"order": 1, "role": "bh",   "label": "Business Head",         "sla_window": "same day (step 1)"},
  {"order": 2, "role": "hrbp", "label": "HRBP",                  "sla_window": "24–48 hrs (steps 2–3)"},
  {"order": 3, "role": "bh",   "label": "Business Head",         "sla_window": "24–48 hrs (steps 4–6)"},
  {"order": 4, "role": "ceo",  "label": "CEO",                   "sla_window": "24 hrs (step 7)"},
  {"order": 5, "role": "bh",   "label": "Business Head (NOC)",   "sla_window": "24 hrs (step 8)"},
  {"order": 6, "role": "hrbp", "label": "HRBP (Exit)",           "sla_window": "8 hrs (step 9)"}
]'::jsonb
WHERE sop_type = 'SOP-4';
