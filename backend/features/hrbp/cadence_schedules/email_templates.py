from __future__ import annotations

from datetime import date, time


def cadence_created_html(
    *,
    created_by_name: str,
    client_name: str,
    consultant_name: str,
    project_name: str | None,
    meeting_type: str,
    start_date: date,
    end_date: date | None,
    meeting_time: time | None,
    duration_minutes: int,
    frequency_weeks: int,
    google_meet_link: str | None,
    recipient_name: str,
) -> str:
    time_str = meeting_time.strftime("%I:%M %p") if meeting_time else "TBD"
    freq_label = (
        "Weekly" if frequency_weeks == 1
        else f"Every {frequency_weeks} weeks"
    )
    meeting_label = "One-time meeting" if meeting_type == "one_time" else f"Recurring — {freq_label}"
    date_range = str(start_date.strftime("%d %b %Y"))
    if meeting_type == "recurring" and end_date:
        date_range += f" → {end_date.strftime('%d %b %Y')}"

    meet_row = ""
    if google_meet_link:
        meet_row = f"""
        <tr>
          <td style="padding:12px 0;color:#374151;font-size:14px;font-weight:600;border-bottom:1px solid #e5e7eb;width:40%;vertical-align:top;">Google Meet</td>
          <td style="padding:12px 0;font-size:14px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            <a href="{google_meet_link}" style="color:#4f46e5;text-decoration:none;font-weight:700;">Join Meeting →</a>
          </td>
        </tr>"""

    project_row = ""
    if project_name:
        project_row = f"""
        <tr>
          <td style="padding:12px 0;color:#374151;font-size:14px;font-weight:600;border-bottom:1px solid #e5e7eb;width:40%;vertical-align:top;">Project</td>
          <td style="padding:12px 0;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;vertical-align:top;">{project_name}</td>
        </tr>"""

    if google_meet_link:
        meet_cta = (
            '<div style="margin:28px 0;text-align:center;">'
            f'<a href="{google_meet_link}" style="display:inline-block;background-color:#4f46e5;'
            'color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;'
            'font-size:15px;font-weight:700;letter-spacing:0.3px;">Join Google Meet</a></div>'
        )
    else:
        meet_cta = ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Cadence Meeting Scheduled</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

        <!-- Header — solid fallback + gradient for supporting clients -->
        <tr>
          <td style="background-color:#4f46e5;background:linear-gradient(135deg,#4f46e5 0%,#6d28d9 100%);padding:36px 40px;">
            <p style="margin:0 0 6px 0;font-size:11px;color:#e0d9ff;letter-spacing:3px;text-transform:uppercase;font-weight:700;">J2W HRBP Platform</p>
            <h1 style="margin:0;font-size:24px;color:#ffffff;font-weight:800;line-height:1.3;">Cadence Meeting Scheduled</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;background-color:#ffffff;">

            <p style="margin:0 0 8px 0;font-size:16px;color:#111827;line-height:1.6;">
              Hi <strong style="color:#111827;">{recipient_name}</strong>,
            </p>
            <p style="margin:0 0 28px 0;font-size:15px;color:#374151;line-height:1.7;">
              A cadence meeting has been scheduled by <strong style="color:#111827;">{created_by_name}</strong>. You have been added as a participant. Here are the details:
            </p>

            <!-- Details table -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <tr style="background-color:#f9fafb;">
                <td style="padding:12px 16px;color:#374151;font-size:14px;font-weight:700;border-bottom:1px solid #e5e7eb;width:40%;vertical-align:top;">Client</td>
                <td style="padding:12px 16px;font-size:14px;color:#111827;font-weight:700;border-bottom:1px solid #e5e7eb;vertical-align:top;">{client_name}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;color:#374151;font-size:14px;font-weight:600;border-bottom:1px solid #e5e7eb;vertical-align:top;">Consultant</td>
                <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;vertical-align:top;">{consultant_name}</td>
              </tr>
              {project_row}
              <tr>
                <td style="padding:12px 16px;color:#374151;font-size:14px;font-weight:600;border-bottom:1px solid #e5e7eb;vertical-align:top;">Meeting Type</td>
                <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;vertical-align:top;">{meeting_label}</td>
              </tr>
              <tr style="background-color:#f9fafb;">
                <td style="padding:12px 16px;color:#374151;font-size:14px;font-weight:600;border-bottom:1px solid #e5e7eb;vertical-align:top;">Date</td>
                <td style="padding:12px 16px;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;vertical-align:top;">{date_range}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;color:#374151;font-size:14px;font-weight:600;border-bottom:1px solid #e5e7eb;vertical-align:top;">Time (IST)</td>
                <td style="padding:12px 16px;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;vertical-align:top;">{time_str}</td>
              </tr>
              <tr style="background-color:#f9fafb;">
                <td style="padding:12px 16px;color:#374151;font-size:14px;font-weight:600;border-bottom:1px solid #e5e7eb;vertical-align:top;">Duration</td>
                <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;vertical-align:top;">{duration_minutes} minutes</td>
              </tr>
              {meet_row}
            </table>

            <!-- Meet CTA -->
            {meet_cta}

            <!-- Note box -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:28px;">
              <tr>
                <td style="background-color:#f0f0ff;border-left:4px solid #4f46e5;border-radius:0 6px 6px 0;padding:14px 16px;">
                  <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">
                    A calendar invite has also been sent to your Google Calendar. If you have any questions, please reach out to <strong style="color:#111827;">{created_by_name}</strong>.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.6;">
              This is an automated notification from the J2W HRBP Platform &nbsp;·&nbsp;
              <a href="mailto:support@joulestowatts.com" style="color:#4f46e5;text-decoration:none;">support@joulestowatts.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""
