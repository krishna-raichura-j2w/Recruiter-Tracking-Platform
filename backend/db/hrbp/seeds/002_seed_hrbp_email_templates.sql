-- ============================================================
-- SEED: hrbp_email_templates
-- 16 rows — E1 through E16
-- Source: HRBP Playbook Section 6
-- ============================================================

INSERT INTO hrbp_email_templates
    (id, name, group_name, channel, subject_tpl, body_tpl,
     required_vars, forbidden_words, locked_cc, sop_step_ref, kra_ref, send_direction)
VALUES

-- E1: Bi-Weekly Check-In
('E1',
 'Bi-Weekly Check-In',
 'routine',
 ARRAY['email', 'whatsapp'],
 'Hi {{consultant_name}} — quick check-in from J2W',
 'Hi {{consultant_name}},

Hope the project is going well.

Just a quick check-in — anything on your mind? Any questions, concerns, or anything J2W can help with?

WhatsApp me directly if it is easier: {{hrbp_mobile}}.

Warm regards,
{{hrbp_name}} | JoulesToWatts',
 ARRAY['consultant_name', 'hrbp_name', 'hrbp_mobile'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 NULL,
 ARRAY['SOP-1:6'],
 ARRAY['K3'],
 'hrbp_to_consultant'),

-- E2: Day 1 Introduction
('E2',
 'Day 1 Introduction',
 'routine',
 ARRAY['email'],
 'Welcome to {{client_name}} — your J2W HRBP is here',
 'Hi {{consultant_name}},

Welcome aboard! I am {{hrbp_name}}, your dedicated HRBP at JoulesToWatts.

Think of me as your career partner — not HR. My job: make sure your time at {{client_name}} is meaningful, your project is right for you, and J2W is helping you grow.

I am here for:
- J2W compensation, documents, admin
- Any concern at work — team, manager, project
- Your career — skills, growth, what is next

I will call you in 15 days. Save my number and WhatsApp me if anything comes up before that.

Glad to have you as a J2Wite.

{{hrbp_name}} | {{hrbp_mobile}} | JoulesToWatts',
 ARRAY['consultant_name', 'hrbp_name', 'hrbp_mobile', 'client_name'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 NULL,
 ARRAY['SOP-1:1'],
 ARRAY['K3'],
 'hrbp_to_consultant'),

-- E3: Resignation Acknowledgement
('E3',
 'Resignation Acknowledgement',
 'incident',
 ARRAY['email'],
 'Re: Your note — let us connect',
 'Hi {{consultant_name}},

Thank you for reaching out.

We have received your note and would like to speak with you directly before we process anything. I would like to understand your perspective better.

Could we speak today or tomorrow — even for 15 to 20 minutes?

{{hrbp_name}} | {{hrbp_mobile}}
JoulesToWatts',
 ARRAY['consultant_name', 'hrbp_name', 'hrbp_mobile'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing', 'last working day', 'LWD', 'relieving'],
 NULL,
 ARRAY['SOP-2:1'],
 ARRAY['K1'],
 'hrbp_to_consultant'),

-- E4: Rate Revision Update
('E4',
 'Rate Revision Update',
 'commercial',
 ARRAY['email'],
 'Update: your compensation review',
 'Hi {{consultant_name}},

I wanted to keep you informed.

I have raised your compensation revision with {{bh_name}}. He is working on it with {{client_name}}. I have shared your tenure, contribution, and the case for this revision.

I will update you as soon as there is clarity — my target is within 3 weeks.

Focus on your delivery. That is the strongest case we can make together.

{{hrbp_name}} | JoulesToWatts',
 ARRAY['consultant_name', 'hrbp_name', 'bh_name', 'client_name'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 NULL,
 NULL,
 ARRAY['K2'],
 'hrbp_to_consultant'),

-- E5: Contract Renewal Notice
('E5',
 'Contract Renewal Notice',
 'commercial',
 ARRAY['email'],
 'Your project engagement — planning ahead',
 'Hi {{consultant_name}},

I am reaching out proactively — your project engagement with {{client_name}} is coming up for review.

{{bh_name}} is handling this directly with {{client_name}}. Our goal is seamless continuity with no disruption to you or the project.

I will keep you posted. If you have any concerns — reach out to me directly.

{{hrbp_name}} | JoulesToWatts',
 ARRAY['consultant_name', 'hrbp_name', 'bh_name', 'client_name'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing', 'contract ending', 'contract expiry'],
 NULL,
 ARRAY['SOP-3:3'],
 ARRAY['K2'],
 'hrbp_to_consultant'),

-- E6A: NOC Single Consultant
('E6A',
 'NOC Single Consultant',
 'commercial',
 ARRAY['email'],
 'Re: {{consultant_name}} — Workforce Transition Process',
 'Dear {{client_contact_name}},

Apologies for the delay. We fully understand the urgency and are prioritising this.

At JoulesToWatts, conversion requests are processed through our Workforce Transition Committee to ensure all offboarding, compliance and handover aspects are completed cleanly for both the J2Wite and the client.

To ensure a smooth conversion without documentation gaps, please align on the below:

Consultant | Employee ID | WO Number | PO End Date | Proposed Conversion Date
{{consultant_name}} | {{emp_id}} | {{wo_number}} | {{po_end_date}} | {{conversion_date}}

This alignment will allow us to issue the NOC without any back-and-forth.

Warm regards,
{{bh_name}} | JoulesToWatts',
 ARRAY['consultant_name', 'emp_id', 'wo_number', 'po_end_date', 'conversion_date', 'bh_name', 'client_contact_name'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 ARRAY['priti.sawant@joulestowatts.com', 'priyamohan@joulestowatts.com'],
 ARRAY['SOP-4:7'],
 ARRAY['K2'],
 'bh_to_client'),

-- E6B: NOC Multiple Consultants
('E6B',
 'NOC Multiple Consultants',
 'commercial',
 ARRAY['email'],
 'Re: Pending NOC Requests — Workforce Transition Update',
 'Dear {{client_contact_name}},

Apologies for the delay on pending NOC requests. We understand the urgency and are actively progressing these.

At JoulesToWatts, conversion requests are routed through our Workforce Transition Committee for clean offboarding and compliance. The below cases are being progressed.

Consultant | Employee ID | WO Number | PO End Date | Proposed Conversion Date
{{consultant_rows}}

Aligning on these dates will help us issue the NOCs cleanly.

Warm regards,
{{bh_name}} | JoulesToWatts',
 ARRAY['client_contact_name', 'consultant_rows', 'bh_name'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 ARRAY['priti.sawant@joulestowatts.com', 'priyamohan@joulestowatts.com'],
 ARRAY['SOP-4:7'],
 ARRAY['K2'],
 'bh_to_client'),

-- E7: PIP Initiation
('E7',
 'PIP Initiation',
 'incident',
 ARRAY['email'],
 'Our conversation today — your 30-day plan',
 'Hi {{consultant_name}},

Thank you for meeting with me today. Here is the 30-day plan we discussed.

This plan helps you get back to your best — not a punishment.

What we are working on:
- {{pip_area_1}}: {{pip_goal_1}}
- {{pip_area_2}}: {{pip_goal_2}}
- Weekly check-ins: Every {{checkin_day}} with {{manager_name}} and me

I will check in with you every day this week. WhatsApp me anytime.

Let us make this work.

{{hrbp_name}} | JoulesToWatts',
 ARRAY['consultant_name', 'hrbp_name', 'pip_area_1', 'pip_goal_1', 'pip_area_2', 'pip_goal_2', 'checkin_day', 'manager_name'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing', 'termination', 'fired'],
 NULL,
 ARRAY['SOP-5:3'],
 ARRAY['K4'],
 'hrbp_to_consultant'),

-- E8: Retention Confirmed
('E8',
 'Retention Confirmed',
 'incident',
 ARRAY['email'],
 'Great news — we found a path forward',
 'Hi {{consultant_name}},

I am really glad we had that conversation and found a way forward together.

To confirm what we agreed:
- {{retention_terms}}

Your commitment to J2W and to {{client_name}} means a great deal. I will check in in two weeks, and then every month.

Thank you for staying as a J2Wite.

{{hrbp_name}} | JoulesToWatts',
 ARRAY['consultant_name', 'hrbp_name', 'client_name', 'retention_terms'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 NULL,
 ARRAY['SOP-2:7'],
 ARRAY['K1'],
 'hrbp_to_consultant'),

-- E9: Hackathon Invite
('E9',
 'Hackathon Invite',
 'routine',
 ARRAY['email'],
 'You are invited — J2W Hackathon, {{hackathon_date}}',
 'Hi {{consultant_name}},

I am personally inviting you to J2W''s {{hackathon_theme}} Hackathon on {{hackathon_date}}.

Theme: {{hackathon_theme}}
Format: Build period {{build_period}} | Submit by {{submit_date}} | Finals: {{finals_date}} at J2W office
Tracks: {{tracks}}

The strongest projects come from genuine problems you have experienced — not from technical complexity.

Register: {{register_link}} | Join Slack: {{slack_link}} | Deadline: {{deadline_date}}

I would love to see you there. Every submission counts.

{{hrbp_name}} | JoulesToWatts',
 ARRAY['consultant_name', 'hrbp_name', 'hackathon_theme', 'hackathon_date', 'build_period', 'submit_date', 'finals_date', 'tracks', 'register_link', 'slack_link', 'deadline_date'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 NULL,
 NULL,
 ARRAY['K3'],
 'hrbp_to_consultant'),

-- E10: Day-End Report
('E10',
 'Day-End Report',
 'routine',
 ARRAY['email'],
 'Day-End Report — {{report_date}} — {{hrbp_name}}',
 'Hi {{ops_head_name}},

Day-end update for {{report_date}}:

CONTACTS TODAY: {{contacts_count}} J2Wites contacted
{{contact_details}}

EXIT PIPELINE:
{{exit_pipeline}}

RED FLAGS: {{red_flags}}

BH CALLS: {{bh_calls}}

PENDING: {{pending_items}}

{{hrbp_name}} | JoulesToWatts',
 ARRAY['ops_head_name', 'report_date', 'hrbp_name', 'contacts_count', 'contact_details', 'exit_pipeline', 'red_flags', 'bh_calls', 'pending_items'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 NULL,
 ARRAY['SOP-1:9'],
 ARRAY['K3'],
 'hrbp_to_ops_head'),

-- E11: Client Site Visit Confirmation
('E11',
 'Client Site Visit Confirmation',
 'routine',
 ARRAY['email'],
 'HRBP Visit — {{visit_date}} — {{client_name}}',
 'Dear Team,

I will be visiting {{client_name}} on {{visit_date}} for individual check-in sessions and a team session.

Your individual slot: {{slot_time}} on {{visit_date}} — calendar invite to follow.

Agenda:
- Individual sessions: 1:1 advisory discussions — compensation, appraisal, any concerns
- Group session: Business update, J2W growth plans, R&R ceremony

Please keep your calendar free for your session. This is a dedicated time for you.

If you have anything specific you would like to discuss, WhatsApp me beforehand.

Looking forward to seeing you.

{{hrbp_name}} | JoulesToWatts',
 ARRAY['client_name', 'visit_date', 'slot_time', 'hrbp_name'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 NULL,
 NULL,
 ARRAY['K3'],
 'hrbp_to_consultant'),

-- E12: Data Request Response to Client
('E12',
 'Data Request Response to Client',
 'commercial',
 ARRAY['email'],
 'Re: Contractor Experience Data — {{client_name}}',
 'Hi {{client_contact_name}},

Thank you for your request.

We are gathering the required data for all J2Wites on your account. We will share the consolidated details by {{delivery_date}}.

Please note: for records of J2Wites whose engagements ended more than {{archive_months}} months ago, we may require additional time to retrieve archived data from our systems.

We will share a consolidated table in the format below and flag any records that require additional time:

Worker | Work Order ID | Yrs. Experience | Skill Set

We appreciate your patience and will update you as soon as we have the complete data.

Warm regards,
{{bh_name}} | JoulesToWatts',
 ARRAY['client_contact_name', 'client_name', 'delivery_date', 'archive_months', 'bh_name'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 NULL,
 NULL,
 ARRAY['K2'],
 'bh_to_client'),

-- E13: Hike Request HRBP to BH
('E13',
 'Hike Request HRBP to BH',
 'commercial',
 ARRAY['email'],
 '[Internal] Rate revision request — {{consultant_name}}',
 'Hi {{bh_name}},

I want to raise a formal rate revision request for the following J2Wite.

J2Wite: {{consultant_name}} | Emp ID: {{emp_id}} | Account: {{client_name}}
Current CTC: Rs.{{current_ctc}}/month | Current PO: Rs.{{current_po}}/month | Current Margin: Rs.{{current_margin}}/month ({{margin_pct}}%)
Last hike date: {{last_hike_date}} | Last hike %: {{last_hike_pct}}%
Tenure: {{tenure_months}} months
Performance tier: {{perf_tier}} | BH feedback: {{bh_feedback}}
Market rate for {{skill}} at {{experience}} years experience: Rs.{{market_rate_low}} to Rs.{{market_rate_high}}/month
Proposed revision: {{proposed_hike_pct}}% hike — New CTC: Rs.{{new_ctc}}/month
New margin post-revision: Rs.{{new_margin}}/month ({{new_margin_pct}}%) — {{margin_status}} threshold

Recommendation: {{recommendation}}

This J2Wite has been {{contribution_note}} and is {{flag_note}}.

Please advise. Happy to prepare a client-facing rate revision brief if you need it.

{{hrbp_name}} | JoulesToWatts',
 ARRAY['consultant_name', 'emp_id', 'client_name', 'current_ctc', 'current_po', 'current_margin', 'margin_pct', 'last_hike_date', 'last_hike_pct', 'tenure_months', 'perf_tier', 'bh_feedback', 'skill', 'experience', 'market_rate_low', 'market_rate_high', 'proposed_hike_pct', 'new_ctc', 'new_margin', 'new_margin_pct', 'margin_status', 'recommendation', 'contribution_note', 'flag_note', 'bh_name', 'hrbp_name'],
 ARRAY['employee', 'payroll', 'deploy', 'staffing'],
 NULL,
 NULL,
 ARRAY['K2'],
 'hrbp_to_bh'),

-- E14: Medical Emergency Alert
('E14',
 'Medical Emergency Alert',
 'medical',
 ARRAY['email'],
 'URGENT: Medical Emergency — {{consultant_name}} — Immediate Action Needed',
 'Hi {{finance_contact_name}},

URGENT — Please treat this as immediate priority.

J2Wite Details:
Name: {{consultant_name}} | Emp ID: {{emp_id}} | Account: {{client_name}}
Hospital: {{hospital_name}}, {{hospital_city}}
Admitted: {{admission_date}} | Ward: {{ward_type}}
Diagnosis: {{diagnosis}}
Insurance policy: J2W Group Health Insurance
Current Status: {{condition_status}}
Estimated bill as of today: Rs.{{estimated_bill}} | Insurance limit: Rs.{{insurance_limit}}

Action Needed:
1. Please contact hospital billing desk immediately and initiate cashless claim
2. Share TPA details with hospital
3. Confirm coverage status and flag if bill is likely to exceed the insurance limit
4. Keep me updated daily on billing and claim status

Family contact: {{family_name}} | {{family_mobile}}
(Please coordinate directly with hospital — family does not need to handle this)

I will brief Operations Head and will await your confirmation.

{{hrbp_name}} | JoulesToWatts | {{hrbp_mobile}}',
 ARRAY['finance_contact_name', 'consultant_name', 'emp_id', 'client_name', 'hospital_name', 'hospital_city', 'admission_date', 'ward_type', 'diagnosis', 'condition_status', 'estimated_bill', 'insurance_limit', 'family_name', 'family_mobile', 'hrbp_name', 'hrbp_mobile'],
 NULL,
 NULL,
 ARRAY['SOP-8:2'],
 ARRAY['K3'],
 'hrbp_to_finance'),

-- E15: Family Outreach After Emergency
('E15',
 'Family Outreach After Emergency',
 'medical',
 ARRAY['email'],
 'Re: {{consultant_name}} — JoulesToWatts is with you',
 'Dear {{family_name}},

I am {{hrbp_name}} from JoulesToWatts — {{consultant_name}}''s dedicated HRBP.

I have just been informed and I am calling you shortly. I want to put this in writing so you have it:

1. Our Finance team has already contacted the hospital to manage the insurance and billing directly. You do not need to do anything on the insurance front.
2. I will update you every day on the status of the insurance claim and any coverage matters.
3. If there is anything at all J2W can help with — please call me directly, any time.

Please save my number: {{hrbp_name}} | {{hrbp_mobile}} — Available 24/7 for this.

All our thoughts and support are with {{consultant_name}} and your family.

Warm regards,
{{hrbp_name}}
JoulesToWatts',
 ARRAY['family_name', 'consultant_name', 'hrbp_name', 'hrbp_mobile'],
 NULL,
 NULL,
 ARRAY['SOP-8:5'],
 ARRAY['K3'],
 'hrbp_to_family'),

-- E16: Finance to Hospital Billing
('E16',
 'Finance to Hospital Billing',
 'medical',
 ARRAY['email'],
 'Insurance Claim Initiation — {{consultant_name}} — J2W Group Health Policy',
 'Dear Billing Team,

This is with reference to J2W patient {{consultant_name}} admitted on {{admission_date}}.

We are JoulesToWatts Business Solutions Pvt. Ltd. — the employer of {{consultant_name}} under our Group Health Insurance Policy.

Policy Details:
Insurer: {{insurer_name}}
Policy Number: {{policy_number}}
TPA: {{tpa_name}}
TPA Contact: {{tpa_helpline}}
Group Policy for: JoulesToWatts employees

Kindly initiate the cashless claim process immediately. Please contact the TPA at {{tpa_helpline}} for pre-authorisation.

If cashless is not possible, please preserve all original bills and discharge summary for reimbursement claim.

Our Finance contact for this case:
{{finance_contact_name}} | {{finance_mobile}} | finance@joulestowatts.com

We will respond to any additional information requests within 2 hours.

Regards,
{{finance_contact_name}}
Finance Team | JoulesToWatts Business Solutions Pvt. Ltd.',
 ARRAY['consultant_name', 'admission_date', 'insurer_name', 'policy_number', 'tpa_name', 'tpa_helpline', 'finance_contact_name', 'finance_mobile'],
 NULL,
 NULL,
 ARRAY['SOP-8:3'],
 ARRAY['K3'],
 'finance_to_hospital')

ON CONFLICT (id) DO NOTHING;
