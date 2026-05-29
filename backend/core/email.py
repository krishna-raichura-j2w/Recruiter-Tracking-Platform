"""SMTP email helpers — Gmail (background jobs) and Outlook (HRBP)."""

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


def send_outlook_email(to_addresses: list[str], subject: str, html_body: str) -> None:
    """Send an HTML email via Outlook SMTP (office365). Used by HRBP features."""
    if not settings.outlook_email or not settings.outlook_password:
        log.warning("Email not sent — OUTLOOK_EMAIL/OUTLOOK_PASSWORD not configured.")
        return
    if not to_addresses:
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.outlook_email
    msg["To"] = ", ".join(to_addresses)
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.outlook_smtp_host, settings.outlook_smtp_port) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(settings.outlook_email, settings.outlook_password)
            smtp.sendmail(settings.outlook_email, to_addresses, msg.as_string())
        log.info("Outlook email sent to %s | subject: %s", to_addresses, subject)
    except Exception as exc:
        log.error("Failed to send Outlook email to %s: %s", to_addresses, exc)
