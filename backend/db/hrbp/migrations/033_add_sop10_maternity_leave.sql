-- Migration 033: Insert SOP-10 — Maternity Leave Process
-- 10 steps: HRBP (1–4) → KAM (5) → HRBP (6–10)
-- Email templates: ML-A (BH+KAM), ML-B (Finance), ML-C (Payroll), ML-D (Employee Reinstatement), ML-E (Employee Redeployment)
-- ============================================================

INSERT INTO hrbp_sop_definitions
    (sop_type, number, name, description, trigger_source,
     kra_tags, control_level, email_templates,
     persons_hierarchy, steps_definition)
VALUES (
  'SOP-10',
  'SOP-10',
  'Maternity Leave Process',
  'End-to-end process for handling maternity leave requests: document validation, commercial impact assessment, BH and Finance approvals, client confirmation for replacement/reinstatement, payroll continuation, and redeployment where required. Regulatory compliance is mandatory — all approvals must be documented.',
  'hrbp_manual',
  ARRAY['K3'],
  'HIGH',
  ARRAY['ML-A', 'ML-B', 'ML-C', 'ML-D', 'ML-E'],

  -- persons_hierarchy: 3 consecutive role groups
  '[
    {"order": 1, "role": "hrbp", "label": "HRBP",                   "sla_window": "Day 0 to 3 working days (steps 1–4)"},
    {"order": 2, "role": "kam",  "label": "Key Account Manager",     "sla_window": "3 working days (step 5)"},
    {"order": 3, "role": "hrbp", "label": "HRBP (Approval & Close)", "sla_window": "1–2 working days per step (steps 6–10)"}
  ]'::jsonb,

  -- steps_definition: 10 steps with medium + medium_config
  '[
    {
      "number": 1,
      "action_label": "Receive maternity leave request",
      "action_detail": "Employee emails HRBP with pregnancy confirmation document and Expected Delivery Date (EDD). HRBP logs the request immediately. Day 0 action — do not delay.",
      "owner_role": "hrbp",
      "sla_working_hours": 8,
      "escalate_to_role": "ops_head",
      "email_template_id": null,
      "hard_gate": null,
      "kra_ref": "K3",
      "medium": "document",
      "medium_config": {
        "instruction": "Upload the pregnancy confirmation document received from the employee. Log the Expected Delivery Date and confirm receipt.",
        "accepted_formats": ["pdf", "jpg", "jpeg", "png", "docx"],
        "max_files": 2
      }
    },
    {
      "number": 2,
      "action_label": "Validate documents and employee details",
      "action_detail": "HRBP verifies: pregnancy confirmation validity, employee details, Expected Delivery Date, current deployment/project status. If incomplete, request clarification from employee.",
      "owner_role": "hrbp",
      "sla_working_hours": 8,
      "escalate_to_role": "ops_head",
      "email_template_id": null,
      "hard_gate": null,
      "kra_ref": "K3",
      "medium": "status_update",
      "medium_config": {
        "instruction": "Validate all submitted documents and confirm the details are complete. If anything is missing, select Incomplete and request clarification from the employee before proceeding.",
        "status_options": [
          {"value": "validated",      "label": "Validated — all documents and details confirmed"},
          {"value": "incomplete",     "label": "Incomplete — clarification requested from employee"},
          {"value": "pending_review", "label": "Pending Review — documents received, checking validity"}
        ],
        "extra_fields": [
          {"key": "employee_id",          "label": "Employee ID",                         "type": "text",     "required": true},
          {"key": "expected_delivery_date","label": "Expected Delivery Date (EDD)",        "type": "date",     "required": true},
          {"key": "current_project",       "label": "Current Project / Deployment",        "type": "text",     "required": true},
          {"key": "validation_notes",      "label": "Validation Notes / Clarification Sent","type": "textarea","required": false}
        ]
      }
    },
    {
      "number": 3,
      "action_label": "Collect commercial / billing details from Billing Team",
      "action_detail": "Before approaching BH, HRBP must obtain billing details from the Billing Team: PO, Margin, CTC, Margin %, DOJ, Company, Designation, PO End Date, Total Experience. Billing Team to respond within 1 working day.",
      "owner_role": "hrbp",
      "sla_working_hours": 8,
      "escalate_to_role": "ops_head",
      "email_template_id": null,
      "hard_gate": null,
      "kra_ref": "K3",
      "medium": "form",
      "medium_config": {
        "instruction": "Fill in the commercial details received from the Billing Team. Do NOT proceed to BH approval without completing this step.",
        "form_schema": [
          {"key": "employee_id",        "label": "Employee ID",                 "type": "text",     "required": true},
          {"key": "employee_name",      "label": "Employee Name",               "type": "text",     "required": true},
          {"key": "company_name",       "label": "Client Company",              "type": "text",     "required": true},
          {"key": "designation",        "label": "Designation",                 "type": "text",     "required": true},
          {"key": "doj",                "label": "Date of Joining (DOJ)",       "type": "date",     "required": true},
          {"key": "po_end_date",        "label": "PO End Date",                 "type": "date",     "required": true},
          {"key": "monthly_po",         "label": "PO Amount (Monthly ₹)",       "type": "number",   "required": true},
          {"key": "monthly_margin",     "label": "Margin (Monthly ₹)",          "type": "number",   "required": true},
          {"key": "current_ctc",        "label": "CTC (Monthly ₹)",             "type": "number",   "required": true},
          {"key": "margin_pct",         "label": "Current Margin %",            "type": "number",   "required": true},
          {"key": "total_experience",   "label": "Total Experience (Years)",    "type": "number",   "required": false},
          {"key": "maternity_start",    "label": "Proposed Leave Start Date",   "type": "date",     "required": true},
          {"key": "maternity_end",      "label": "Estimated Leave End Date",    "type": "date",     "required": true},
          {"key": "projected_impact",   "label": "Projected Financial Impact (₹)","type": "number", "required": true}
        ]
      }
    },
    {
      "number": 4,
      "action_label": "Send BH approval request — copy KAM to check with client",
      "action_detail": "HRBP sends approval request to BH with maternity leave summary, EDD, commercial details, and projected financial impact. KAM copied to confirm with client: replacement requirement and reinstatement willingness after leave.",
      "owner_role": "hrbp",
      "sla_working_hours": 8,
      "escalate_to_role": "ops_head",
      "email_template_id": "ML-A",
      "hard_gate": null,
      "kra_ref": "K3",
      "medium": "email",
      "medium_config": {
        "instruction": "Send ML-A approval request email to the Business Head, copying the KAM/Account Manager. Include the commercial details from Step 3. KAM must then check with the client on replacement and reinstatement.",
        "template_id": "ML-A"
      }
    },
    {
      "number": 5,
      "action_label": "KAM confirms client decision — replacement and reinstatement",
      "action_detail": "KAM contacts client to confirm: (1) Is replacement required during maternity leave? (2) Will reinstatement be allowed after leave? Both answers must be captured and documented.",
      "owner_role": "kam",
      "sla_working_hours": 24,
      "escalate_to_role": "ops_head",
      "email_template_id": null,
      "hard_gate": null,
      "kra_ref": "K3",
      "medium": "status_update",
      "medium_config": {
        "instruction": "Contact the client and capture their decision on both replacement and reinstatement. This confirmation determines the next branch of the process.",
        "status_options": [
          {"value": "reinstatement_confirmed",     "label": "Scenario A — Client confirms reinstatement after leave"},
          {"value": "replacement_only_no_reinstate","label": "Scenario B — Client needs replacement only, no reinstatement"},
          {"value": "no_replacement_reinstate",     "label": "No replacement needed, reinstatement confirmed"},
          {"value": "pending_client_response",      "label": "Pending — awaiting client response"}
        ],
        "extra_fields": [
          {"key": "client_contact",      "label": "Client Contact Name",                  "type": "text",     "required": true},
          {"key": "client_decision_date","label": "Date of Client Confirmation",          "type": "date",     "required": true},
          {"key": "replacement_needed",  "label": "Replacement Required? (Yes/No)",       "type": "text",     "required": true},
          {"key": "client_notes",        "label": "Client Decision Notes",                "type": "textarea", "required": true}
        ]
      }
    },
    {
      "number": 6,
      "action_label": "HRBP records decision branch and initiates action",
      "action_detail": "Scenario A (reinstatement): HRBP informs employee, Delivery Team plans interim replacement if needed. Scenario B (no reinstatement): maternity end date = project LWD, redeployment process initiated immediately with Delivery Team.",
      "owner_role": "hrbp",
      "sla_working_hours": 8,
      "escalate_to_role": "ops_head",
      "email_template_id": null,
      "hard_gate": null,
      "kra_ref": "K3",
      "medium": "status_update",
      "medium_config": {
        "instruction": "Record the outcome branch based on client confirmation from Step 5. If Scenario B, initiate redeployment with the Delivery Team immediately.",
        "status_options": [
          {"value": "scenario_a_reinstate",   "label": "Scenario A — Reinstatement Approved, interim replacement planned if needed"},
          {"value": "scenario_b_redeploy",    "label": "Scenario B — No reinstatement, LWD set, redeployment initiated"},
          {"value": "no_replacement_approved","label": "No replacement needed, reinstatement confirmed, proceeding to approvals"}
        ],
        "extra_fields": [
          {"key": "project_lwd",          "label": "Project LWD (if Scenario B)",         "type": "date",     "required": false},
          {"key": "redeployment_notes",   "label": "Redeployment / Replacement Notes",     "type": "textarea", "required": false}
        ]
      }
    },
    {
      "number": 7,
      "action_label": "Send Finance approval request to Banita",
      "action_detail": "After BH approval, HRBP sends case to Finance (Banita) with: employee details, commercial details, projected financial impact, and BH approval confirmation. Finance must respond within 2 working days.",
      "owner_role": "hrbp",
      "sla_working_hours": 8,
      "escalate_to_role": "ops_head",
      "email_template_id": "ML-B",
      "hard_gate": null,
      "kra_ref": "K3",
      "medium": "email",
      "medium_config": {
        "instruction": "Send ML-B Finance approval request to Banita. Include all commercial details and BH approval confirmation. Finance must respond within 2 working days. Do NOT initiate salary release before Finance approval.",
        "template_id": "ML-B"
      }
    },
    {
      "number": 8,
      "action_label": "Inform Timesheet / Payroll SPOC to release salary",
      "action_detail": "Once Finance approval is received, HRBP informs Timesheet/Payroll SPOC to ensure salary release during the approved maternity leave period. Include all leave dates and Finance approval reference.",
      "owner_role": "hrbp",
      "sla_working_hours": 8,
      "escalate_to_role": "ops_head",
      "email_template_id": "ML-C",
      "hard_gate": null,
      "kra_ref": "K3",
      "medium": "email",
      "medium_config": {
        "instruction": "Send ML-C payroll instruction email to the Timesheet/Payroll SPOC. Include leave start date, leave end date, EDD, and Finance approval date. Salary release must not be initiated without Finance approval.",
        "template_id": "ML-C"
      }
    },
    {
      "number": 9,
      "action_label": "Communicate final status to employee",
      "action_detail": "HRBP formally informs employee: approval confirmation, client dependency outcome, reinstatement confirmation (Scenario A) or redeployment discussion (Scenario B), payroll/leave next steps.",
      "owner_role": "hrbp",
      "sla_working_hours": 8,
      "escalate_to_role": "ops_head",
      "email_template_id": "ML-D",
      "hard_gate": null,
      "kra_ref": "K3",
      "medium": "email",
      "medium_config": {
        "instruction": "Send employee communication email. Use ML-D (Reinstatement Confirmed) for Scenario A or ML-E (Replacement Only / Redeployment Required) for Scenario B. Confirm the correct template is selected before sending.",
        "template_id": "ML-D"
      }
    },
    {
      "number": 10,
      "action_label": "Update tracker and close case",
      "action_detail": "HRBP updates tracker with: approval dates, financial impact, client decision, reinstatement/replacement status, redeployment status, payroll intimation date, final closure status. Tracker must be updated at every milestone.",
      "owner_role": "hrbp",
      "sla_working_hours": 8,
      "escalate_to_role": "ops_head",
      "email_template_id": null,
      "hard_gate": null,
      "kra_ref": "K3",
      "medium": "status_update",
      "medium_config": {
        "instruction": "Update the tracker with all milestones and mark the final closure status. All fields below are required for audit compliance.",
        "status_options": [
          {"value": "closed_reinstated",    "label": "Closed — Reinstatement Confirmed"},
          {"value": "closed_redeployed",    "label": "Closed — Redeployment Initiated"},
          {"value": "closed_no_replacement","label": "Closed — No Replacement, Reinstatement Approved"},
          {"value": "in_progress",          "label": "In Progress — pending milestone"}
        ],
        "extra_fields": [
          {"key": "bh_approval_date",       "label": "BH Approval Date",             "type": "date",     "required": true},
          {"key": "finance_approval_date",  "label": "Finance Approval Date",        "type": "date",     "required": true},
          {"key": "payroll_intimation_date","label": "Payroll Intimation Date",      "type": "date",     "required": true},
          {"key": "leave_start_date",       "label": "Leave Start Date",             "type": "date",     "required": true},
          {"key": "leave_end_date",         "label": "Leave End Date (Estimated)",   "type": "date",     "required": true},
          {"key": "financial_impact",       "label": "Total Financial Impact (₹)",   "type": "number",   "required": true},
          {"key": "closure_notes",          "label": "Closure Notes",               "type": "textarea", "required": false}
        ]
      }
    }
  ]'::jsonb
)
ON CONFLICT (sop_type) DO UPDATE
  SET steps_definition  = EXCLUDED.steps_definition,
      persons_hierarchy = EXCLUDED.persons_hierarchy,
      name              = EXCLUDED.name,
      description       = EXCLUDED.description,
      email_templates   = EXCLUDED.email_templates;
