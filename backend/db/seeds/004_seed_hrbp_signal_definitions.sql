-- ============================================================
-- SEED: hrbp_signal_definitions
-- 7 rows — S1 through S7
-- Source: HRBP Playbook Section 3
-- Note: Run AFTER hrbp_sop_definitions is seeded
-- ============================================================

INSERT INTO hrbp_signal_definitions
    (signal_code, number, name, source, description,
     indicators, auto_action, auto_sop_trigger,
     threshold_count, urgency)
VALUES

('s1_pre_onboarding',
 'S1',
 'Pre-Onboarding',
 'recruiter',
 'Signals observed during recruitment before the consultant joins. Mandatory handover from recruiter to HRBP in writing.',
 ARRAY[
   'Communication quality on calls — articulate, clear, confident or not',
   'Tech screening score — passed strongly or barely',
   'Offer acceptance behaviour — asked about continuity or C2H',
   'Vague notice period mentioned',
   'Asked about third-party payroll',
   'Unsure about joining date'
 ],
 'Log recruiter handover in writing. Flag any red flags to HRBP before Day 1.',
 NULL,
 NULL,
 'monitor'),

('s2_performance',
 'S2',
 'Consultant Performance',
 'hrbp_observation',
 'Signals observed through HRBP engagement conversations. Responsiveness and energy are the two key proxies.',
 ARRAY[
   'Does not respond to messages within 24 hrs — low responsiveness = low engagement',
   'Talks about project with fatigue not energy — tone is satisfaction proxy',
   'Does not ask about career, skills, or growth — not curious = disengaging',
   'Does not use AI tools at work or explore on their own',
   'Not on Reddit, Product Hunt, or Hacker News — passive working not proactive learning',
   'Cannot explain their project simply — poor understanding or communication'
 ],
 'Log observation. Monitor for 2 cycles. If persistent, brief BH and consider cohort downgrade.',
 NULL,
 NULL,
 'monitor'),

('s3_bh_feedback',
 'S3',
 'BH and Customer Feedback',
 'bh_feedback',
 'Signals gathered during the monthly BH call using the Q3 feedback template.',
 ARRAY[
   'Manager mentions consultant only when there is a problem — not proactively',
   'Consultant has not been given a stretch assignment recently',
   'Client team is consolidating or flat — no growth signal',
   'Unsolicited negative comment about J2Wite from client',
   'J2Wite is not part of any new project, product, or initiative at client'
 ],
 'Update BH feedback score in consultant profile. Downgrade tier if feedback is bad. Flag to HRBP for action.',
 NULL,
 NULL,
 'monitor'),

('s4_behaviour',
 'S4',
 'Behaviour and Etiquette',
 'hrbp_observation',
 'Behavioural signals observed directly by HRBP. Two or more S4 signals automatically opens SOP-6.',
 ARRAY[
   'Sudden change in tone — warm to cold, engaged to one-word answers',
   'Missing standups or team meetings — even once or twice must be logged',
   'Complaint from a peer however informal — document with date and source',
   'Attendance issues: late, leaving early, absent without notice',
   'Social media: posting frustration, updating LinkedIn, surge in new connections'
 ],
 '2 or more S4 signals within 30 days automatically opens SOP-6 Misconduct case.',
 'SOP-6',
 2,
 'same_day'),

('s5_upsell',
 'S5',
 'Upsell and Expansion',
 'hrbp_observation',
 'Signals indicating potential for J2W to place additional consultants at the client. Pass to BH within 24 hours. HRBP does NOT act on upsell directly.',
 ARRAY[
   'Client is hiring more — from which vendors is also important',
   'New team, product, or mandate starting at the client',
   'Global team from US or Europe involved — new HQ mandate',
   'New tech stack or tool approved at client that J2W could staff',
   'Team is growing — leading indicator of future demand'
 ],
 'Pass to BH the same day. Do NOT act on upsell yourself. Log in signals with note: passed to BH on [date].',
 NULL,
 NULL,
 'same_day'),

('s6_resignation',
 'S6',
 'Resignation Signals',
 'hrbp_observation',
 'Early signals that a consultant may be planning to resign. One S6 signal is enough to open SOP-2 immediately.',
 ARRAY[
   'LinkedIn profile update: new headline, Open to Work, or surge in new connections',
   'Asking HR hypothetically about F&F, notice period, or relieving letter',
   'Peer mentions receiving a message from the J2Wite about other opportunities',
   'NPS score dropped from previous survey',
   'Going quiet — no response within 48 hrs after being previously active',
   'Asking about salary revision urgently after months of patience'
 ],
 'Classify risk immediately: RED (Top 20% and PO above Rs.3L), AMBER (Mid 60%), GREEN (Bottom 20%). Notify HRBP immediately.',
 'SOP-2',
 1,
 'immediate'),

('s7_conversion',
 'S7',
 'Conversion and NOC Signals',
 'hrbp_observation',
 'Signals that the client wants to hire the J2Wite directly. Alert BH same day. Do NOT discuss conversion terms with J2Wite or client.',
 ARRAY[
   'Client asks BH about J2Wite availability for direct hire — even casually',
   'J2Wite says client offered me a role directly',
   'Client asks for J2Wite personal email or mobile separately from work email',
   'J2Wite asks if J2W would release them from the current project'
 ],
 'Alert BH same day. Do NOT discuss conversion terms with client or J2Wite. BH raises to Priti for NOC sign-off.',
 'SOP-4',
 1,
 'immediate');