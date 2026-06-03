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
          <td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Google Meet Link</td>
          <td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f3f4f6;">
            <a href="{google_meet_link}" style="color:#4f46e5;text-decoration:none;font-weight:600;">Join Meeting</a>
          </td>
        </tr>"""

    project_row = ""
    if project_name:
        project_row = f"""
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Project</td>
          <td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f3f4f6;">{project_name}</td>
        </tr>"""

    if google_meet_link:
        meet_cta = (
            '<div style="margin:32px 0;text-align:center;">'
            f'<a href="{google_meet_link}" style="display:inline-block;background:#4f46e5;'
            'color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;'
            'font-size:15px;font-weight:600;">Join Google Meet</a></div>'
        )
    else:
        meet_cta = ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:32px 40px;">
            <p style="margin:0;font-size:11px;color:#c4b5fd;letter-spacing:2px;text-transform:uppercase;">J2W HRBP Platform</p>
            <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Cadence Meeting Scheduled</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Hi <strong>{recipient_name}</strong>,
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              A cadence meeting has been scheduled by <strong>{created_by_name}</strong>. You have been added as a participant. Here are the details:
            </p>

            <!-- Details table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f3f4f6;">
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;width:40%;">Client</td>
                <td style="padding:8px 0;font-size:14px;font-weight:600;border-bottom:1px solid #f3f4f6;">{client_name}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Consultant</td>
                <td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f3f4f6;">{consultant_name}</td>
              </tr>
              {project_row}
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Meeting Type</td>
                <td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f3f4f6;">{meeting_label}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Date</td>
                <td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f3f4f6;">{date_range}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Time (IST)</td>
                <td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f3f4f6;">{time_str}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Duration</td>
                <td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f3f4f6;">{duration_minutes} minutes</td>
              </tr>
              {meet_row}
            </table>

            <!-- Meet CTA -->
            {meet_cta}

            <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
              A calendar invite has also been sent to your Google Calendar. If you have any questions, please reach out to <strong>{created_by_name}</strong>.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This is an automated notification from the J2W HRBP Platform &nbsp;·&nbsp; support@joulestowatts.com
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""
