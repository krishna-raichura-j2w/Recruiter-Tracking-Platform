-- ============================================================
-- SEED: hrbp_sop_definitions
-- 8 rows — SOP-1 through SOP-8
-- Source: HRBP Playbook Section 4
-- ============================================================

INSERT INTO hrbp_sop_definitions
    (sop_type, number, name, description, trigger_source,
     kra_tags, control_level, email_templates,
     persons_hierarchy, steps_definition)
VALUES

-- ============================================================
-- SOP-1: Regular Engagement
-- ============================================================
('SOP-1', 'SOP-1', 'Regular Engagement',
 'Ongoing cadence with every active J2Wite from Day 1 onwards. This is the baseline SOP that runs continuously for every consultant.',
 'scheduler',
 ARRAY['K3', 'K4'],
 'HIGH',
 ARRAY['E1', 'E2', 'E10'],
 '[
   {"order": 1, "role": "hrbp",     "label": "HRBP",             "sla_window": "ongoing"},
   {"order": 2, "role": "ops_head", "label": "Operations Head",  "sla_window": "escalation only"}
 ]'::jsonb,
 '[
   {"number": 1, "action_label": "Day 1 intro — WhatsApp + email within 2 hours", "action_detail": "Send E2 template. Introduce yourself as career partner not HR admin.", "owner_role": "hrbp", "sla_working_hours": 2, "escalate_to_role": "ops_head", "email_template_id": "E2", "hard_gate": null, "kra_ref": "K3"},
   {"number": 2, "action_label": "Day 15 connect — video or in-person", "action_detail": "Check system access, manager clarity, project clarity, first impressions.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": "E1", "hard_gate": null, "kra_ref": "K3"},
   {"number": 3, "action_label": "Day 45 joint lock — HRBP + BH together", "action_detail": "Is J2Wite settling? Client happy? Lock 1-year intent. Use the Day 45 script from playbook.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "bh", "email_template_id": null, "hard_gate": null, "kra_ref": "K3"},
   {"number": 4, "action_label": "Day 60 tier classification", "action_detail": "Classify cohort: Star / High Performer / Rising / Bedrock / Watch / Rescue.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 5, "action_label": "Day 90 first quarterly review", "action_detail": "Top 20%: rate revision check. Bottom 20%: PIP starts.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": "E1", "hard_gate": null, "kra_ref": "K4"},
   {"number": 6, "action_label": "Bi-weekly check-in email", "action_detail": "Send E1 template every 14 days. Track non-responders. 2 missed cycles = escalate.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": "E1", "hard_gate": null, "kra_ref": "K3"},
   {"number": 7, "action_label": "Monthly BH call", "action_detail": "One call per account. Use Q3 BH template. Capture written feedback.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 8, "action_label": "Quarterly NPS survey dispatch", "action_detail": "5-question survey. Target 80% response rate. Act on score below 7 within 7 days.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K3"},
   {"number": 9, "action_label": "Day-end report to Operations Head", "action_detail": "Send E10 template daily by 6 PM. Contacts, red flags, exits, BH calls, pending items.", "owner_role": "hrbp", "sla_working_hours": 1, "escalate_to_role": "ops_head", "email_template_id": "E10", "hard_gate": null, "kra_ref": "K3"}
 ]'::jsonb),

-- ============================================================
-- SOP-2: Voluntary Resignation
-- ============================================================
('SOP-2', 'SOP-2', 'Voluntary Resignation',
 'Triggered when a resignation is received via any channel. Retain first — always. Never confirm LWD until BH and client confirm.',
 'email_classified|hrbp_manual',
 ARRAY['K1'],
 'HIGH',
 ARRAY['E3', 'E8'],
 '[
   {"order": 1, "role": "hrbp",     "label": "HRBP",            "sla_window": "0 to 8 hrs"},
   {"order": 2, "role": "bh",       "label": "Business Head",   "sla_window": "8 to 48 hrs"},
   {"order": 3, "role": "ops_head", "label": "Operations Head", "sla_window": "48 to 72 hrs"},
   {"order": 4, "role": "coo",      "label": "COO + Priti CC",  "sla_window": "72+ hrs"}
 ]'::jsonb,
 '[
   {"number": 1,  "action_label": "Capture resignation — do NOT confirm LWD", "action_detail": "Log within 1 hr. Acknowledge receipt only. Do NOT confirm LWD. Send E3 template.", "owner_role": "hrbp", "sla_working_hours": 1, "escalate_to_role": "bh", "email_template_id": "E3", "hard_gate": "BLOCK_LWD_CONFIRMATION", "kra_ref": "K1"},
   {"number": 2,  "action_label": "Prepare comprehensive retention plan", "action_detail": "Assess tier, PO, reason, retention feasibility. Document before any conversation. No engagement without a plan.", "owner_role": "hrbp", "sla_working_hours": 2, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"},
   {"number": 3,  "action_label": "Same-day 1:1 within 4 hours", "action_detail": "Listen 80%, talk 20%. Capture: CTC, offer in hand, expected CTC, willing to stay?", "owner_role": "hrbp", "sla_working_hours": 4, "escalate_to_role": "bh", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"},
   {"number": 4,  "action_label": "Classify risk level", "action_detail": "RED: Top 20% and PO above Rs.3L. AMBER: Mid 60%. GREEN: Bottom 20%.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"},
   {"number": 5,  "action_label": "Brief BH with full summary", "action_detail": "Summary to BH within 24 hrs: name, tier, PO, reason, offer in hand, HRBP assessment.", "owner_role": "hrbp", "sla_working_hours": 24, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"},
   {"number": 6,  "action_label": "BH makes retention decision", "action_detail": "BH evaluates within 48 hrs. Finance checks comp. Decision in 5 working days.", "owner_role": "bh", "sla_working_hours": 48, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"},
   {"number": 7,  "action_label": "If RETAIN — confirm and get written withdrawal", "action_detail": "Offer via BH not HRBP. Written withdrawal from J2Wite mandatory. Update tracker. Fortnightly 1:1 for 3 months.", "owner_role": "hrbp", "sla_working_hours": 24, "escalate_to_role": "ops_head", "email_template_id": "E8", "hard_gate": "REQUIRE_WRITTEN_WITHDRAWAL", "kra_ref": "K1"},
   {"number": 8,  "action_label": "If EXIT — confirm LWD and start redeployment", "action_detail": "Confirm LWD only after BH and client align. KT plan. Circulate CV to all BHs.", "owner_role": "hrbp", "sla_working_hours": 168, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": "REQUIRE_BH_AND_CLIENT_SIGNOFF", "kra_ref": "K1"},
   {"number": 9,  "action_label": "Post-retention watch — 90 days mandatory", "action_detail": "Fortnightly 1:1 and monthly BH check mandatory for 90 days. Retained J2Wite is vulnerable.", "owner_role": "hrbp", "sla_working_hours": 2160, "escalate_to_role": "ops_head", "email_template_id": "E1", "hard_gate": null, "kra_ref": "K1"},
   {"number": 10, "action_label": "Exit interview — last week of notice", "action_detail": "Capture real reason. Update dashboard. Must be completed before last working day.", "owner_role": "hrbp", "sla_working_hours": 168, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"}
 ]'::jsonb),

-- ============================================================
-- SOP-3: Contract Closure and Redeployment
-- ============================================================
('SOP-3', 'SOP-3', 'Contract Closure and Redeployment',
 'Flag 4 months before PO end — not 90 days. Earlier flag = more time for BH to renew with client.',
 'scheduler',
 ARRAY['K2'],
 'MEDIUM',
 ARRAY['E5'],
 '[
   {"order": 1, "role": "hrbp",     "label": "HRBP",            "sla_window": "4 months before"},
   {"order": 2, "role": "bh",       "label": "Business Head",   "sla_window": "3.5 months before"},
   {"order": 3, "role": "ops_head", "label": "Operations Head", "sla_window": "1 month before"},
   {"order": 4, "role": "coo",      "label": "COO + Priti",     "sla_window": "under 1 month"}
 ]'::jsonb,
 '[
   {"number": 1, "action_label": "4-month flag — add to Contract Review cohort", "action_detail": "System or PO team flags POs ending in 4 months. HRBP updates tracker and alerts BH.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"},
   {"number": 2, "action_label": "BH initiates renewal with client by 3.5-month mark", "action_detail": "BH contacts client directly. HRBP is NOT in this conversation.", "owner_role": "bh", "sla_working_hours": 40, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"},
   {"number": 3, "action_label": "HRBP connects with J2Wite at 3 months before", "action_detail": "Reassure: Bollama is managing your renewal. No disruption expected. Assess preference. Send E5.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": "E5", "hard_gate": null, "kra_ref": "K2"},
   {"number": 4, "action_label": "Collect updated CV within 48 hours", "action_detail": "Share updated CV with all BHs immediately.", "owner_role": "hrbp", "sla_working_hours": 48, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"},
   {"number": 5, "action_label": "Active redeployment — 2 months before", "action_detail": "Client confirms non-extension. BH notifies HRBP same day. HRBP informs J2Wite within 4 hrs.", "owner_role": "hrbp", "sla_working_hours": 4, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"},
   {"number": 6, "action_label": "No redeployment by 1 month — escalate", "action_detail": "Operations Head and Priya notified. Daily tracking. HRBP and BH on daily calls.", "owner_role": "ops_head", "sla_working_hours": 8, "escalate_to_role": "coo", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"},
   {"number": 7, "action_label": "Day 0 — Redeploy or Close", "action_detail": "Redeployed: new PO before Day 0. Closure: letter on last day. F&F per policy.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"}
 ]'::jsonb),

-- ============================================================
-- SOP-4: Conversion / NOC Request
-- ============================================================
('SOP-4', 'SOP-4', 'Conversion and NOC Request',
 'Client wants to hire J2Wite directly. Approximately 8.5% conversion fee. Priti sign-off mandatory. NOC without Priti is not valid.',
 'email_classified|hrbp_manual',
 ARRAY['K2'],
 'MEDIUM',
 ARRAY['E6A', 'E6B'],
 '[
   {"order": 1, "role": "hrbp",  "label": "HRBP",         "sla_window": "same day"},
   {"order": 2, "role": "bh",    "label": "Business Head", "sla_window": "24 to 48 hrs"},
   {"order": 3, "role": "priti", "label": "Priti",         "sla_window": "48 to 72 hrs"},
   {"order": 4, "role": "coo",   "label": "COO",           "sla_window": "72+ hrs"}
 ]'::jsonb,
 '[
   {"number": 1, "action_label": "Alert BH same day — do not discuss with anyone else", "action_detail": "HRBP or BH hears conversion intent. Alert BH same day. Do NOT discuss with J2Wite or client yet.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"},
   {"number": 2, "action_label": "Check MSA eligibility — min tenure clause", "action_detail": "Verify MSA clause: minimum tenure for conversion is 12 to 24 months. Check with Invoice Team.", "owner_role": "hrbp", "sla_working_hours": 24, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"},
   {"number": 3, "action_label": "Connect with J2Wite within 48 hours", "action_detail": "Understand intent. Listen only — do NOT influence decision.", "owner_role": "hrbp", "sla_working_hours": 48, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"},
   {"number": 4, "action_label": "BH evaluates counter-offer within 48 hours", "action_detail": "If retention possible, BH makes offer within 48 hrs.", "owner_role": "bh", "sla_working_hours": 48, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"},
   {"number": 5, "action_label": "Client submits NOC request in standard format", "action_detail": "Format: Consultant name, Employee ID, WO Number, PO End Date, Proposed Conversion Date.", "owner_role": "bh", "sla_working_hours": 24, "escalate_to_role": "ops_head", "email_template_id": "E6A", "hard_gate": null, "kra_ref": "K2"},
   {"number": 6, "action_label": "BH submits to Priti — fee, MSA, PO impact", "action_detail": "BH submits to Priti with conversion fee, MSA clause, PO impact details. Priti responds within 24 working hours.", "owner_role": "bh", "sla_working_hours": 24, "escalate_to_role": "coo", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"},
   {"number": 7, "action_label": "NOC issued after Priti approval", "action_detail": "BH issues NOC via E6A or E6B template. Invoice Team notified.", "owner_role": "bh", "sla_working_hours": 24, "escalate_to_role": "ops_head", "email_template_id": "E6A", "hard_gate": "REQUIRE_PRITI_APPROVAL", "kra_ref": "K2"},
   {"number": 8, "action_label": "Clean exit — LWD confirmed, exit interview done", "action_detail": "HRBP confirms LWD. Exit interview. Update tracker: reason = Conversion to Client.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K2"}
 ]'::jsonb),

-- ============================================================
-- SOP-5: Performance Issues and PIP
-- ============================================================
('SOP-5', 'SOP-5', 'Performance Issues and PIP',
 'Document before acting. No documentation = no PIP. Weekly reviews are non-negotiable.',
 'hrbp_manual|signal_threshold',
 ARRAY['K4'],
 'HIGH',
 ARRAY['E7'],
 '[
   {"order": 1, "role": "hrbp",     "label": "HRBP + Manager", "sla_window": "0 to 5 days"},
   {"order": 2, "role": "bh",       "label": "Business Head",  "sla_window": "5 to 15 days"},
   {"order": 3, "role": "ops_head", "label": "Operations Head","sla_window": "15 to 30 days"},
   {"order": 4, "role": "priti",    "label": "Priti",          "sla_window": "Day 30 termination decision"}
 ]'::jsonb,
 '[
   {"number": 1, "action_label": "Manager documents specific incidents with evidence", "action_detail": "Manager documents incidents with dates and evidence. HRBP validates specificity. No vague complaints.", "owner_role": "hrbp", "sla_working_hours": 48, "escalate_to_role": "bh", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 2, "action_label": "HRBP and BH decide — coaching, PIP, or exit", "action_detail": "Do NOT inform client before internal decision is made.", "owner_role": "hrbp", "sla_working_hours": 48, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 3, "action_label": "PIP initiation — J2Wite signs 30-day plan", "action_detail": "HRBP + Manager + J2Wite meeting. Share PIP document with specific goals and 30-day timeline. J2Wite must sign.", "owner_role": "hrbp", "sla_working_hours": 40, "escalate_to_role": "ops_head", "email_template_id": "E7", "hard_gate": null, "kra_ref": "K4"},
   {"number": 4, "action_label": "Weekly PIP review — every 5 working days", "action_detail": "HRBP + Manager + J2Wite. Document progress. Review missed = immediate escalation to BH and Operations Head.", "owner_role": "hrbp", "sla_working_hours": 40, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 5, "action_label": "Day 15 mid-assessment", "action_detail": "Improving or not improving. If not improving: start quiet replacement sourcing.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 6, "action_label": "Day 30 final assessment", "action_detail": "PASS: close PIP and document. FAIL: termination process begins immediately.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "priti", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 7, "action_label": "If FAIL — termination with Priti approval", "action_detail": "Priti MUST be informed and approve before execution. Client informed by BH. Replacement starts Day 0.", "owner_role": "bh", "sla_working_hours": 48, "escalate_to_role": "coo", "email_template_id": null, "hard_gate": "REQUIRE_PRITI_APPROVAL", "kra_ref": "K4"}
 ]'::jsonb),

-- ============================================================
-- SOP-6: Difficult Consultant and Misconduct
-- ============================================================
('SOP-6', 'SOP-6', 'Difficult Consultant and Misconduct',
 'Act on signals before the client or leadership escalates. Early action = control. Late action = crisis.',
 'signal_threshold|hrbp_manual',
 ARRAY['K4'],
 'MEDIUM',
 ARRAY[]::text[],
 '[
   {"order": 1, "role": "hrbp",     "label": "HRBP",             "sla_window": "same day"},
   {"order": 2, "role": "bh",       "label": "Business Head",    "sla_window": "within 24 hrs"},
   {"order": 3, "role": "ops_head", "label": "Ops Head + Legal", "sla_window": "social media or escalation"}
 ]'::jsonb,
 '[
   {"number": 1, "action_label": "Detect 2 or more S4 signals — document immediately", "action_detail": "Document with date and source immediately. Must be done within 24 hrs of detection.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 2, "action_label": "Private 1:1 within 24 to 48 hours", "action_detail": "Do NOT accuse. Say: I noticed some things I want to understand. Listen first.", "owner_role": "hrbp", "sla_working_hours": 48, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 3, "action_label": "Document everything from the meeting", "action_detail": "Written record: date, what was said, J2Wite response. Must be done same day as meeting.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 4, "action_label": "Brief BH proactively — do not wait to be asked", "action_detail": "Tell BH: I have early signals on this person. Here is what I am doing. Within 24 hrs.", "owner_role": "hrbp", "sla_working_hours": 24, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 5, "action_label": "Decide — 30-day PIP or start quiet backfill", "action_detail": "If client has formed a view: quietly start replacement. Decision by Day 5.", "owner_role": "hrbp", "sla_working_hours": 40, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 6, "action_label": "If social media attack — do NOT respond individually", "action_detail": "Alert Operations Head and Legal same day. Legal team vets any response. Zero individual response.", "owner_role": "ops_head", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K4"},
   {"number": 7, "action_label": "Formal warning or termination — Priti sign-off required", "action_detail": "Priti sign-off before any termination. All documentation must be filed.", "owner_role": "bh", "sla_working_hours": 48, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": "REQUIRE_PRITI_APPROVAL", "kra_ref": "K4"}
 ]'::jsonb),

-- ============================================================
-- SOP-7: Absconding
-- ============================================================
('SOP-7', 'SOP-7', 'Absconding',
 'Day 1 of unannounced absence triggers the clock. Process is clear — follow exactly.',
 'hrbp_manual|attendance_flag',
 ARRAY['K1'],
 'HIGH',
 ARRAY[]::text[],
 '[
   {"order": 1, "role": "hrbp",     "label": "HRBP",            "sla_window": "0 to 2 hrs"},
   {"order": 2, "role": "bh",       "label": "Business Head",   "sla_window": "2 to 4 hrs"},
   {"order": 3, "role": "ops_head", "label": "Ops Head + Priti","sla_window": "Day 3"}
 ]'::jsonb,
 '[
   {"number": 1, "action_label": "Day 1 — call and WhatsApp within 2 hours", "action_detail": "Attendance flag or manager reports absence. HRBP calls and WhatsApps within 2 hrs.", "owner_role": "hrbp", "sla_working_hours": 2, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"},
   {"number": 2, "action_label": "BH informs client within 4 hours", "action_detail": "BH notifies client within 4 hrs. HRBP does NOT contact client directly.", "owner_role": "bh", "sla_working_hours": 4, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"},
   {"number": 3, "action_label": "Formal written communication by Day 1 EOD", "action_detail": "Email and WhatsApp: We noted your absence. Respond within 48 hrs.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"},
   {"number": 4, "action_label": "Day 2 follow-up — call, email, emergency contact", "action_detail": "Call and email again. Try emergency contact if available.", "owner_role": "hrbp", "sla_working_hours": 24, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"},
   {"number": 5, "action_label": "Day 3 — declare absconding, inform Priti immediately", "action_detail": "48 hrs no response = absconding confirmed. Priti informed immediately. No exceptions.", "owner_role": "hrbp", "sla_working_hours": 48, "escalate_to_role": "coo", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"},
   {"number": 6, "action_label": "Termination letter issued within 24 hours", "action_detail": "HR Ops issues termination letter. No F&F. No relieving letter. Exit tracker updated.", "owner_role": "hrbp", "sla_working_hours": 24, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K1"}
 ]'::jsonb),

-- ============================================================
-- SOP-8: Medical Emergency
-- ============================================================
('SOP-8', 'SOP-8', 'Medical Emergency Critical Illness and Death',
 'For planned procedures J2Wite must inform HRBP before going to hospital. For emergencies family calls HRBP within 2 hours — NOT the insurance company.',
 'hrbp_manual',
 ARRAY['K3'],
 'HIGH',
 ARRAY['E14', 'E15', 'E16'],
 '[
   {"order": 1, "role": "hrbp",     "label": "HRBP",         "sla_window": "within 2 hrs of admission"},
   {"order": 2, "role": "finance",  "label": "Finance",      "sla_window": "within 60 mins of HRBP alert"},
   {"order": 3, "role": "ops_head", "label": "Ops Head",     "sla_window": "same day if critical"},
   {"order": 4, "role": "priti",    "label": "Priti + COO",  "sla_window": "if bill exceeds limit or death"}
 ]'::jsonb,
 '[
   {"number": 1,  "action_label": "J2Wite or family alerts HRBP within 2 hours", "action_detail": "Planned: J2Wite informs HRBP before admission. Emergency: family calls HRBP within 2 hrs. Never call insurance company directly.", "owner_role": "hrbp", "sla_working_hours": 2, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K3"},
   {"number": 2,  "action_label": "HRBP calls Finance within 60 minutes", "action_detail": "Send E14 immediately. Finance must contact hospital billing within 60 mins. Planned: before admission. Emergency: within 60 mins.", "owner_role": "hrbp", "sla_working_hours": 1, "escalate_to_role": "ops_head", "email_template_id": "E14", "hard_gate": null, "kra_ref": "K3"},
   {"number": 3,  "action_label": "Finance contacts hospital billing — same day", "action_detail": "Finance initiates J2W group insurance cashless claim. Provides TPA details. Send E16 to hospital.", "owner_role": "finance", "sla_working_hours": 1, "escalate_to_role": "ops_head", "email_template_id": "E16", "hard_gate": null, "kra_ref": "K3"},
   {"number": 4,  "action_label": "Finance assesses coverage within 24 hours", "action_detail": "Confirms insurance limit, current bill, projected total. Flags immediately if bill will exceed limit.", "owner_role": "finance", "sla_working_hours": 24, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K3"},
   {"number": 5,  "action_label": "HRBP connects with family same day", "action_detail": "Warm, human, reassuring call. Send E15. J2W is handling insurance and billing. You focus on being with your family member.", "owner_role": "hrbp", "sla_working_hours": 8, "escalate_to_role": "ops_head", "email_template_id": "E15", "hard_gate": null, "kra_ref": "K3"},
   {"number": 6,  "action_label": "Daily updates — HRBP to Operations Head", "action_detail": "HRBP briefs Ops Head daily: condition, bill status, family needs, insurance status.", "owner_role": "hrbp", "sla_working_hours": 24, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K3"},
   {"number": 7,  "action_label": "If bill exceeds insurance limit — escalate to Priti", "action_detail": "Finance confirms overage to Priti and COO. Evaluate ex-gratia support. Family not told until decision made.", "owner_role": "finance", "sla_working_hours": 48, "escalate_to_role": "priti", "email_template_id": null, "hard_gate": null, "kra_ref": "K3"},
   {"number": 8,  "action_label": "If J2Wite recovers — return to work plan", "action_detail": "Finance processes reimbursement. HRBP follows up on return-to-work plan. BH informed of return date.", "owner_role": "hrbp", "sla_working_hours": 168, "escalate_to_role": "ops_head", "email_template_id": null, "hard_gate": null, "kra_ref": "K3"},
   {"number": 9,  "action_label": "If J2Wite passes away — inform Priti and COO immediately", "action_detail": "HRBP informs Ops Head, COO, Priti immediately. Finance initiates death benefit claim. Priority F&F. HRBP coordinates with family on formalities.", "owner_role": "hrbp", "sla_working_hours": 1, "escalate_to_role": "priti", "email_template_id": null, "hard_gate": null, "kra_ref": "K3"},
   {"number": 10, "action_label": "Post-event family support — within 7 days", "action_detail": "HRBP follows up with family within 7 days. Assist with all documentation, F&F settlement, and death benefit disbursement coordination with Finance. Ensure no outstanding obligations remain.", "owner_role": "hrbp", "sla_working_hours": 168, "escalate_to_role": "priti", "email_template_id": null, "hard_gate": null, "kra_ref": "K3"}
 ]'::jsonb)

ON CONFLICT (sop_type) DO NOTHING;
