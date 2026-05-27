"""Thin Gmail SMTP helper used by background jobs."""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from core.config import settings

log = logging.getLogger(__name__)


def send_email(to_addresses: list[str], subject: str, html_body: str) -> None:
    """Send an HTML email via Gmail SMTP. Silently no-ops if credentials are absent."""
    if not settings.gmail_user or not settings.gmail_app_password:
        log.warning("Email not sent — GMAIL_USER/GMAIL_APP_PASSWORD not configured.")
        return
    if not to_addresses:
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.gmail_user
    msg["To"] = ", ".join(to_addresses)
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(settings.gmail_user, settings.gmail_app_password)
            smtp.sendmail(settings.gmail_user, to_addresses, msg.as_string())
        log.info("Email sent to %s | subject: %s", to_addresses, subject)
    except Exception as exc:
        log.error("Failed to send email to %s: %s", to_addresses, exc)
