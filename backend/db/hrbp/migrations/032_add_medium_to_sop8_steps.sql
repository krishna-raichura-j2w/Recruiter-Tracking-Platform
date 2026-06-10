-- Migration 032: Add medium + medium_config to SOP-8 steps
-- Medical Emergency Critical Illness and Death — 10 steps.
-- persons_hierarchy updated to 5 consecutive role groups.
-- ============================================================

UPDATE hrbp_sop_definitions
SET steps_definition = '[
  {
    "number": 1,
    "action_label": "J2Wite or family alerts HRBP within 2 hours",
    "action_detail": "Planned: J2Wite informs HRBP before admission. Emergency: family calls HRBP within 2 hrs. Never call insurance company directly.",
    "owner_role": "hrbp",
    "sla_working_hours": 2,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K3",
    "medium": "status_update",
    "medium_config": {
      "instruction": "Log the admission alert and update status. Do NOT call the insurance company directly — all communication goes through Finance.",
      "status_options": [
        {"value": "alerted",          "label": "HRBP Alerted — admission confirmed"},
        {"value": "emergency",        "label": "Emergency Admission — family called within 2 hrs"},
        {"value": "planned",          "label": "Planned Admission — notified before admission"},
        {"value": "monitoring",       "label": "Monitoring — situation developing"}
      ],
      "extra_fields": [
        {"key": "hospital_name",      "label": "Hospital Name",               "type": "text",     "required": true},
        {"key": "admission_type",     "label": "Admission Type (Planned/Emergency)", "type": "text", "required": true},
        {"key": "alert_log",          "label": "Alert Log / Notes",           "type": "textarea", "required": false}
      ]
    }
  },
  {
    "number": 2,
    "action_label": "HRBP calls Finance within 60 minutes",
    "action_detail": "Send E14 immediately. Finance must contact hospital billing within 60 mins. Planned: before admission. Emergency: within 60 mins.",
    "owner_role": "hrbp",
    "sla_working_hours": 1,
    "escalate_to_role": "ops_head",
    "email_template_id": "E14",
    "hard_gate": null,
    "kra_ref": "K3",
    "medium": "email",
    "medium_config": {
      "instruction": "Send E14 trigger email to Finance immediately. Finance must contact hospital billing within 60 minutes of this notification.",
      "template_id": "E14"
    }
  },
  {
    "number": 3,
    "action_label": "Finance contacts hospital billing — same day",
    "action_detail": "Finance initiates J2W group insurance cashless claim. Provides TPA details. Send E16 to hospital.",
    "owner_role": "finance",
    "sla_working_hours": 1,
    "escalate_to_role": "ops_head",
    "email_template_id": "E16",
    "hard_gate": null,
    "kra_ref": "K3",
    "medium": "email",
    "medium_config": {
      "instruction": "Send E16 cashless claim initiation to hospital billing. Provide TPA details and initiate J2W group insurance cashless claim. Upload confirmation document if available.",
      "template_id": "E16"
    }
  },
  {
    "number": 4,
    "action_label": "Finance assesses coverage within 24 hours",
    "action_detail": "Confirms insurance limit, current bill, projected total. Flags immediately if bill will exceed limit.",
    "owner_role": "finance",
    "sla_working_hours": 24,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K3",
    "medium": "status_update",
    "medium_config": {
      "instruction": "Assess insurance coverage and file the coverage assessment report internally. Flag immediately if the bill is projected to exceed the insurance limit.",
      "status_options": [
        {"value": "within_limit",     "label": "Within Limit — bill covered by insurance"},
        {"value": "exceeds_limit",    "label": "Exceeds Limit — escalation required to Priti/COO"},
        {"value": "monitoring",       "label": "Monitoring — projected total uncertain"}
      ],
      "extra_fields": [
        {"key": "insurance_limit",    "label": "Insurance Limit (₹)",         "type": "number",   "required": true},
        {"key": "current_bill",       "label": "Current Bill Amount (₹)",     "type": "number",   "required": true},
        {"key": "projected_total",    "label": "Projected Total (₹)",         "type": "number",   "required": true},
        {"key": "assessment_notes",   "label": "Coverage Assessment Notes",   "type": "textarea", "required": false}
      ]
    }
  },
  {
    "number": 5,
    "action_label": "HRBP connects with family same day",
    "action_detail": "Warm, human, reassuring call. Send E15. J2W is handling insurance and billing. You focus on being with your family member.",
    "owner_role": "hrbp",
    "sla_working_hours": 8,
    "escalate_to_role": "ops_head",
    "email_template_id": "E15",
    "hard_gate": null,
    "kra_ref": "K3",
    "medium": "email",
    "medium_config": {
      "instruction": "Send E15 family reassurance email. Follow up with a warm, personal call to the family. Reassure them that J2W is handling all insurance and billing — family should focus on their loved one.",
      "template_id": "E15"
    }
  },
  {
    "number": 6,
    "action_label": "Daily updates — HRBP to Operations Head",
    "action_detail": "HRBP briefs Ops Head daily: condition, bill status, family needs, insurance status.",
    "owner_role": "hrbp",
    "sla_working_hours": 24,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K3",
    "medium": "comment",
    "medium_config": {
      "instruction": "Send a daily condition briefing to the Operations Head covering: current medical condition, bill status, family needs, and insurance status. Log the briefing summary here.",
      "placeholder": "Daily briefing summary: medical condition update, current bill, insurance status, family needs, any escalation required..."
    }
  },
  {
    "number": 7,
    "action_label": "If bill exceeds insurance limit — escalate to Priti",
    "action_detail": "Finance confirms overage to Priti and COO. Evaluate ex-gratia support. Family not told until decision made.",
    "owner_role": "finance",
    "sla_working_hours": 48,
    "escalate_to_role": "ceo",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K3",
    "medium": "status_update",
    "medium_config": {
      "instruction": "Raise the overage escalation note to Priti and COO. Evaluate if ex-gratia support is applicable. Do NOT inform the family until a decision has been made.",
      "status_options": [
        {"value": "ex_gratia_approved",  "label": "Ex-Gratia Approved — J2W will cover overage"},
        {"value": "ex_gratia_rejected",  "label": "Ex-Gratia Rejected — family to bear overage"},
        {"value": "pending_decision",    "label": "Pending Decision — Priti/COO reviewing"}
      ],
      "extra_fields": [
        {"key": "overage_amount",        "label": "Overage Amount (₹)",            "type": "number",   "required": true},
        {"key": "escalation_notes",      "label": "Escalation Notes for Priti/COO","type": "textarea", "required": true}
      ]
    }
  },
  {
    "number": 8,
    "action_label": "If J2Wite recovers — return to work plan",
    "action_detail": "Finance processes reimbursement. HRBP follows up on return-to-work plan. BH informed of return date.",
    "owner_role": "hrbp",
    "sla_working_hours": 168,
    "escalate_to_role": "ops_head",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K3",
    "medium": "status_update",
    "medium_config": {
      "instruction": "Confirm recovery outcome. HRBP to coordinate return-to-work plan and ensure Finance processes any reimbursement. Upload medical fitness certificate if available.",
      "status_options": [
        {"value": "recovered_rtw",       "label": "Recovered — Return to Work confirmed"},
        {"value": "partial_recovery",    "label": "Partial Recovery — phased return planned"},
        {"value": "extended_leave",      "label": "Extended Leave — return date TBD"},
        {"value": "not_applicable",      "label": "Not Applicable — outcome was not recovery"}
      ],
      "extra_fields": [
        {"key": "return_date",           "label": "Confirmed Return-to-Work Date",  "type": "date",     "required": false},
        {"key": "rtw_notes",             "label": "Return-to-Work Notes",           "type": "textarea", "required": false}
      ]
    }
  },
  {
    "number": 9,
    "action_label": "If J2Wite passes away — inform Priti and COO immediately",
    "action_detail": "HRBP informs Ops Head, COO, Priti immediately. Finance initiates death benefit claim. Priority F&F. HRBP coordinates with family on formalities.",
    "owner_role": "hrbp",
    "sla_working_hours": 1,
    "escalate_to_role": "ceo",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K3",
    "medium": "status_update",
    "medium_config": {
      "instruction": "If the J2Wite has passed away, send immediate notification to Ops Head, COO, and Priti. Finance must initiate the death benefit claim as Priority F&F. HRBP coordinates all family formalities.",
      "status_options": [
        {"value": "notified",            "label": "Leadership Notified — Priti, COO, Ops Head informed"},
        {"value": "death_benefit_filed", "label": "Death Benefit Filed — Finance initiated claim"},
        {"value": "ff_in_progress",      "label": "F&F In Progress — coordinating with family"},
        {"value": "not_applicable",      "label": "Not Applicable — outcome was not death"}
      ],
      "extra_fields": [
        {"key": "date_of_passing",       "label": "Date of Passing",                "type": "date",     "required": false},
        {"key": "notification_notes",    "label": "Notification & Coordination Notes", "type": "textarea", "required": false}
      ]
    }
  },
  {
    "number": 10,
    "action_label": "Post-event family support — within 7 days",
    "action_detail": "HRBP follows up with family within 7 days. Assist with all documentation, F&F settlement, and death benefit disbursement coordination with Finance. Ensure no outstanding obligations remain.",
    "owner_role": "hrbp",
    "sla_working_hours": 168,
    "escalate_to_role": "ceo",
    "email_template_id": null,
    "hard_gate": null,
    "kra_ref": "K3",
    "medium": "status_update",
    "medium_config": {
      "instruction": "Complete all post-event family support within 7 days. Ensure F&F settlement is processed, death benefit disbursed (if applicable), and all documentation completed. Confirm zero outstanding obligations.",
      "status_options": [
        {"value": "ff_settled",          "label": "F&F Settled — all dues cleared"},
        {"value": "benefit_disbursed",   "label": "Death Benefit Disbursed to family"},
        {"value": "documentation_done",  "label": "All Documentation Completed"},
        {"value": "closed",              "label": "Closed — no outstanding obligations"}
      ],
      "extra_fields": [
        {"key": "closure_notes",         "label": "Closure Notes",                  "type": "textarea", "required": true}
      ]
    }
  }
]'::jsonb
WHERE sop_type = 'SOP-8';

-- Update persons_hierarchy — 5 consecutive role groups matching the 10-step ownership chain
UPDATE hrbp_sop_definitions
SET persons_hierarchy = '[
  {"order": 1, "role": "hrbp",    "label": "HRBP",                    "sla_window": "within 2 hrs (steps 1–2)"},
  {"order": 2, "role": "finance", "label": "Finance",                  "sla_window": "same day (steps 3–4)"},
  {"order": 3, "role": "hrbp",    "label": "HRBP",                    "sla_window": "same day to 24 hrs (steps 5–6)"},
  {"order": 4, "role": "finance", "label": "Finance (Escalation)",     "sla_window": "48 hrs (step 7)"},
  {"order": 5, "role": "hrbp",    "label": "HRBP (Closure)",          "sla_window": "up to 7 days (steps 8–10)"}
]'::jsonb
WHERE sop_type = 'SOP-8';
