"""Lightweight email delivery using the Python stdlib (no extra dependencies).

If SMTP credentials are configured it sends a real email; otherwise (local dev)
it logs the message so flows like password reset / verification stay testable.
"""
import logging
import smtplib
from email.message import EmailMessage

from core.config import settings

logger = logging.getLogger("uptime.email")


def smtp_configured() -> bool:
    return bool(settings.SMTP_USER and settings.SMTP_PASSWORD)


def send_email(to: str, subject: str, body: str) -> bool:
    """Returns True if a real email was sent, False if it was only logged (dev mode)."""
    if not smtp_configured():
        logger.warning(
            "[email:dev] SMTP not configured — would send to %s\nSubject: %s\n%s",
            to, subject, body,
        )
        return False

    msg = EmailMessage()
    msg["From"] = settings.FROM_EMAIL
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001 — never let email failures break the request
        logger.error("Failed to send email to %s: %s", to, exc)
        return False
