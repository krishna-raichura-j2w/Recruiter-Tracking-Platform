-- Migration 018: per-hierarchy-step SLA tracking
-- Adds step_started_at / step_sla_alerted_at to hrbp_tickets so the
-- scheduler can fire once per step when that step owner's SLA window expires.
-- Also inserts two email templates (EST1, EST2) for step-level breach alerts.

-- ── 1. New columns on hrbp_tickets ──────────────────────────────────────────
ALTER TABLE hrbp_tickets
    ADD COLUMN IF NOT EXISTS step_started_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS step_sla_alerted_at TIMESTAMPTZ;

-- Back-fill existing tickets so the scheduler can act on them immediately
UPDATE hrbp_tickets
   SET step_started_at = created_at
 WHERE step_started_at IS NULL;

-- ── 2. Widen the send_direction CHECK to allow 'system_internal' ─────────────
ALTER TABLE hrbp_email_templates
    DROP CONSTRAINT IF EXISTS hrbp_email_templates_send_direction_check;

ALTER TABLE hrbp_email_templates
    ADD CONSTRAINT hrbp_email_templates_send_direction_check
    CHECK (send_direction = ANY (ARRAY[
        'hrbp_to_consultant',
        'hrbp_to_bh',
        'hrbp_to_ops_head',
        'hrbp_to_finance',
        'hrbp_to_family',
        'bh_to_client',
        'finance_to_hospital',
        'system_internal'
    ]));

-- ── 3. Email template EST1 — Step SLA breach alert to the step owner ─────────
INSERT INTO hrbp_email_templates (
    id, name, group_name, channel,
    subject_tpl, body_tpl,
    required_vars, send_direction,
    sop_step_ref, kra_ref
) VALUES (
    'EST1',
    'Step SLA Breach — Step Owner Alert',
    'incident',
    ARRAY['email'],
    '[ACTION REQUIRED] Your step on {{ticket_number}} is overdue — {{step_label}}',
    '<html><body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:auto;padding:24px">
<div style="background:#dc2626;border-radius:8px 8px 0 0;padding:16px 24px">
  <h2 style="color:#fff;margin:0;font-size:18px">&#9888; Step SLA Breached</h2>
</div>
<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px">
  <p style="margin:0 0 16px">Hi <strong>{{step_owner_name}}</strong>,</p>
  <p style="margin:0 0 16px">
    Your step on ticket <strong>{{ticket_number}}</strong> has exceeded its SLA window
    of <strong>{{sla_hours}} working hours</strong> and is now overdue.
  </p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tr style="background:#f9fafb">
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:35%">Ticket</td>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;font-weight:600">{{ticket_number}} — {{ticket_title}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280">Your Step</td>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;font-weight:600">{{step_label}}</td>
    </tr>
    <tr style="background:#f9fafb">
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280">SLA Window</td>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#dc2626;font-weight:600">{{sla_hours}} working hours (breached)</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280">Step Started</td>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px">{{step_started_at}}</td>
    </tr>
  </table>
  <p style="margin:0 0 16px">
    Please take immediate action on this ticket. Delays beyond this point will be
    escalated to <strong>{{escalation_mgr_name}}</strong>.
  </p>
  <p style="margin:0;color:#6b7280;font-size:12px">
    This is an automated alert from the J2W HRBP Ticket System.
  </p>
</div>
</body></html>',
    ARRAY['ticket_number','ticket_title','step_label','sla_hours','step_owner_name','step_started_at','escalation_mgr_name'],
    'system_internal',
    NULL,
    NULL
) ON CONFLICT (id) DO NOTHING;

-- ── 4. Email template EST2 — Step SLA breach alert to the escalation manager ─
INSERT INTO hrbp_email_templates (
    id, name, group_name, channel,
    subject_tpl, body_tpl,
    required_vars, send_direction,
    sop_step_ref, kra_ref
) VALUES (
    'EST2',
    'Step SLA Breach — Escalation Manager Alert',
    'incident',
    ARRAY['email'],
    '[ESCALATION] Step SLA breached on {{ticket_number}} — {{step_label}} ({{step_owner_name}})',
    '<html><body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:auto;padding:24px">
<div style="background:#92400e;border-radius:8px 8px 0 0;padding:16px 24px">
  <h2 style="color:#fff;margin:0;font-size:18px">&#128680; Escalation — Step SLA Breached</h2>
</div>
<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px">
  <p style="margin:0 0 16px">Hi <strong>{{escalation_mgr_name}}</strong>,</p>
  <p style="margin:0 0 16px">
    This is an escalation notice. The current step owner on ticket
    <strong>{{ticket_number}}</strong> has exceeded their SLA window and has not acted.
  </p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tr style="background:#fef3c7">
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:35%">Ticket</td>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;font-weight:600">{{ticket_number}} — {{ticket_title}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280">Overdue Step</td>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;font-weight:600">{{step_label}}</td>
    </tr>
    <tr style="background:#fef3c7">
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280">Step Owner</td>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#dc2626">{{step_owner_name}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280">SLA Window</td>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#dc2626;font-weight:600">{{sla_hours}} working hours (breached)</td>
    </tr>
    <tr style="background:#fef3c7">
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280">Step Started</td>
      <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px">{{step_started_at}}</td>
    </tr>
  </table>
  <p style="margin:0 0 16px">
    Please follow up with <strong>{{step_owner_name}}</strong> directly or take ownership
    of this step to prevent further delays.
  </p>
  <p style="margin:0;color:#6b7280;font-size:12px">
    This is an automated escalation from the J2W HRBP Ticket System.
  </p>
</div>
</body></html>',
    ARRAY['ticket_number','ticket_title','step_label','sla_hours','step_owner_name','step_started_at','escalation_mgr_name'],
    'system_internal',
    NULL,
    NULL
) ON CONFLICT (id) DO NOTHING;
