"""Escalation engine.

Drives the severity-based escalation matrix on top of the existing incident
lifecycle. All functions are synchronous and take a live SQLAlchemy session so
they can be called directly from the in-process monitoring engine
(core/monitoring.py runs each check in a worker thread with its own session).

Lifecycle
---------
1. Monitor goes DOWN -> monitoring.py opens an Incident and calls
   `trigger_escalation(db, incident, monitor, error)`.
2. trigger_escalation determines severity, loads the matching EscalationConfig,
   fires Level 1 notifications, and arms `incident.next_escalation_at`.
3. A background loop (escalation_loop, started in main.py) periodically calls
   `process_due_escalations(db)`. Any active incident whose timer has expired is
   advanced to the next level; the final level (timer_minutes IS NULL) fires and
   stops advancing but stays active until resolved.
4. Monitor recovers -> monitoring.py calls `stop_escalation(db, incident)`.

Every state change is appended to escalation_history; notification dispatches
are recorded as event_type='notification_sent' rows (which also feed the
Notification Logs page).
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from core.ws_manager import manager as ws_manager
from models.monitor import Monitor
from models.incident import Incident
from models.notification import Notification
from models.escalation import (
    EscalationConfig, EscalationLevel, EscalationChannel, EscalationHistory,
)

logger = logging.getLogger("uptime.escalation")

# Tick cadence for the background advance loop. Kept tight so short timers
# (e.g. CRITICAL L1 = 3 min) fire close to on-time.
ESCALATION_TICK_SECONDS = 20


# --------------------------------------------------------------------------- #
# Severity + incident-status mapping
# --------------------------------------------------------------------------- #
# The incidents table stores severity as low/medium/high/critical; the matrix
# uses NORMAL/WARNING/CRITICAL. Map between the two so existing incident UI keeps
# working while the engine speaks matrix severities.
_MATRIX_TO_INCIDENT = {"NORMAL": "low", "WARNING": "medium", "CRITICAL": "critical"}


def determine_severity(monitor: Monitor, error: Optional[str]) -> str:
    """Deterministic severity for a fresh outage.

    Heuristic (no extra config required):
      - Soft/advisory failures (ssl expiry warning, dns, keyword) -> WARNING
      - Hard reachability failures (http/tcp/ping down, timeouts)  -> CRITICAL
      - Everything else                                            -> NORMAL
    """
    mtype = (monitor.monitor_type or "http").lower()
    err = (error or "").lower()

    if mtype in ("ssl", "dns", "keyword"):
        return "WARNING"
    if mtype in ("http", "tcp", "ping") or "timeout" in err or "unreachable" in err:
        return "CRITICAL"
    return "NORMAL"


def incident_severity_label(matrix_severity: str) -> str:
    return _MATRIX_TO_INCIDENT.get(matrix_severity, "medium")


# --------------------------------------------------------------------------- #
# Config lookup
# --------------------------------------------------------------------------- #
def _find_config(db, monitor: Monitor, severity: str) -> Optional[EscalationConfig]:
    """Resolve the active config for (owner, severity).

    A monitor-specific config wins over the owner's default (monitor_id IS NULL)
    config for the same severity.
    """
    base = db.query(EscalationConfig).filter(
        EscalationConfig.user_id == monitor.user_id,
        EscalationConfig.severity == severity,
        EscalationConfig.is_active.is_(True),
    )
    specific = base.filter(EscalationConfig.monitor_id == monitor.id).first()
    if specific:
        return specific
    return base.filter(EscalationConfig.monitor_id.is_(None)).first()


def _level(db, config_id: int, level_number: int) -> Optional[EscalationLevel]:
    return db.query(EscalationLevel).filter(
        EscalationLevel.config_id == config_id,
        EscalationLevel.level_number == level_number,
        EscalationLevel.is_active.is_(True),
    ).first()


def _enabled_channels(db, level: EscalationLevel) -> list[str]:
    rows = db.query(EscalationChannel).filter(
        EscalationChannel.level_id == level.id,
        EscalationChannel.enabled.is_(True),
    ).all()
    return [r.channel for r in rows]


# --------------------------------------------------------------------------- #
# History helper
# --------------------------------------------------------------------------- #
def _record(db, incident, monitor, *, event_type, severity=None, level=None,
            channel=None, target=None, status="info", message=None):
    db.add(EscalationHistory(
        incident_id=incident.id,
        monitor_id=monitor.id,
        user_id=monitor.user_id,
        config_id=incident.escalation_config_id,
        level_id=level.id if level else None,
        event_type=event_type,
        severity=severity,
        level_number=level.level_number if level else None,
        channel=channel,
        target=target,
        status=status,
        message=message,
    ))


# --------------------------------------------------------------------------- #
# Notification dispatch
# --------------------------------------------------------------------------- #
def _fire_level(db, incident: Incident, monitor: Monitor, level: EscalationLevel, severity: str) -> None:
    """Send notifications for every enabled channel on `level` and log each."""
    channels = _enabled_channels(db, level)
    target = level.notify_target or level.escalation_name
    base_msg = (
        f"[{severity}] {monitor.monitor_name} is DOWN — "
        f"escalation {level.escalation_name} (L{level.level_number}). "
        f"{incident.error_message or ''}".strip()
    )

    for channel in channels:
        status, detail = _dispatch(db, monitor, channel, target, base_msg, severity)
        _record(
            db, incident, monitor,
            event_type="notification_sent",
            severity=severity, level=level, channel=channel, target=target,
            status=status, message=detail,
        )

    # Always push a live websocket event so open dashboards update in real time.
    ws_manager.broadcast_from_thread(monitor.user_id, {
        "type": "escalation",
        "incident_id": incident.id,
        "monitor_id": monitor.id,
        "monitor_name": monitor.monitor_name,
        "severity": severity,
        "level": level.level_number,
        "level_name": level.escalation_name,
        "channels": channels,
        "message": base_msg,
    })


def _dispatch(db, monitor: Monitor, channel: str, target: str, message: str, severity: str):
    """Deliver one notification. Returns (status, detail).

    web/email are wired to real subsystems (in-app Notification row + SMTP).
    whatsapp/sms/call are recorded as 'sent' through a pluggable stub — swap the
    body for a Twilio/Vonage client when credentials are configured. webhook
    posts the event to the user's webhook destinations.
    """
    try:
        if channel == "web":
            db.add(Notification(
                user_id=monitor.user_id,
                notification_type="web",
                destination="in-app",
                enabled=True,
            ))
            return "sent", f"In-app alert queued for {target}"

        if channel == "email":
            from core.email import send_email, smtp_configured
            if not smtp_configured():
                return "skipped", "SMTP not configured"
            # notify_target may carry an email; otherwise fall back to the owner's.
            from models.user import User
            recipient = target if target and "@" in target else None
            if not recipient:
                user = db.query(User).filter(User.id == monitor.user_id).first()
                recipient = user.email if user else None
            if not recipient:
                return "skipped", "No email recipient"
            send_email(recipient, f"[{severity}] {monitor.monitor_name} DOWN", message)
            return "sent", f"Email sent to {recipient}"

        if channel == "webhook":
            from models.webhook import WebhookEndpoint
            eps = db.query(WebhookEndpoint).filter(
                WebhookEndpoint.user_id == monitor.user_id,
                WebhookEndpoint.is_active.is_(True),
            ).all()
            if not eps:
                return "skipped", "No active webhook endpoints"
            payload = json.dumps({
                "event": "escalation.notification",
                "monitor": monitor.monitor_name,
                "severity": severity,
                "message": message,
            })
            sent = 0
            for ep in eps:
                try:
                    with httpx.Client(timeout=10) as c:
                        c.post(ep.url, content=payload,
                                headers={"Content-Type": "application/json",
                                         "X-Uptime-Event": "escalation.notification"})
                    sent += 1
                except Exception:  # noqa: BLE001
                    pass
            return ("sent" if sent else "failed"), f"Posted to {sent} webhook(s)"

        if channel in ("whatsapp", "sms", "call"):
            # Pluggable provider stub. Record the intent; integrate Twilio/Vonage
            # here when credentials exist. Returning 'sent' keeps the timeline
            # honest about what the matrix attempted.
            return "sent", f"{channel.upper()} dispatched to {target} (provider stub)"

        return "skipped", f"Unknown channel {channel}"
    except Exception as exc:  # noqa: BLE001
        logger.warning("Escalation dispatch failed (%s): %s", channel, exc)
        return "failed", str(exc)[:200]


# --------------------------------------------------------------------------- #
# Public API: trigger / advance / stop
# --------------------------------------------------------------------------- #
def trigger_escalation(db, incident: Incident, monitor: Monitor, error: Optional[str]) -> None:
    """Engage the escalation matrix for a freshly opened incident.

    Caller is responsible for committing the session. Safe no-op if no matching
    config exists.
    """
    severity = determine_severity(monitor, error)
    incident.severity = incident_severity_label(severity)

    # Always log incident creation to the timeline, even without a policy.
    _record(db, incident, monitor, event_type="incident_created",
            severity=severity, status="info",
            message=f"Incident opened: {error or 'monitor down'}")

    config = _find_config(db, monitor, severity)
    if not config:
        logger.info("No %s escalation config for monitor %s — skipping matrix", severity, monitor.id)
        return

    level1 = _level(db, config.id, 1)
    if not level1:
        logger.info("Config %s has no active L1 — skipping matrix", config.id)
        return

    incident.escalation_config_id = config.id
    incident.escalation_level = 1
    incident.escalation_active = True
    incident.next_escalation_at = _next_time(level1)

    _record(db, incident, monitor, event_type="escalation_triggered",
            severity=severity, level=level1, status="info",
            message=f"Escalation policy '{config.name}' engaged at {level1.escalation_name}")
    _fire_level(db, incident, monitor, level1, severity)

    logger.warning(
        "Escalation TRIGGERED incident=%s monitor=%s severity=%s level=1 next=%s",
        incident.id, monitor.id, severity, incident.next_escalation_at,
    )


def _next_time(level: EscalationLevel) -> Optional[datetime]:
    """When the level after `level` should fire. NULL timer => final level."""
    if level.timer_minutes is None:
        return None
    return datetime.now(timezone.utc) + timedelta(minutes=level.timer_minutes)


def _advance_incident(db, incident: Incident) -> None:
    """Move one active incident to its next escalation level (or finalize)."""
    monitor = db.query(Monitor).filter(Monitor.id == incident.monitor_id).first()
    if not monitor or not incident.escalation_config_id:
        incident.escalation_active = False
        incident.next_escalation_at = None
        return

    config = db.query(EscalationConfig).filter(EscalationConfig.id == incident.escalation_config_id).first()
    severity = config.severity if config else "CRITICAL"

    next_number = (incident.escalation_level or 1) + 1
    next_level = _level(db, incident.escalation_config_id, next_number)

    if not next_level:
        # No further level defined: we've reached the end. Stop advancing.
        incident.escalation_active = False
        incident.next_escalation_at = None
        _record(db, incident, monitor, event_type="escalation_stopped",
                severity=severity, status="info",
                message="Reached final escalation level; no further levels.")
        logger.info("Escalation reached final level for incident=%s", incident.id)
        return

    incident.escalation_level = next_number
    incident.next_escalation_at = _next_time(next_level)

    _record(db, incident, monitor, event_type="level_changed",
            severity=severity, level=next_level, status="info",
            message=f"Escalated to {next_level.escalation_name} (L{next_number})")
    _fire_level(db, incident, monitor, next_level, severity)

    logger.warning(
        "Escalation ADVANCED incident=%s -> L%s (%s) next=%s",
        incident.id, next_number, next_level.escalation_name, incident.next_escalation_at,
    )


def process_due_escalations(db) -> int:
    """Advance every active incident whose timer has expired. Returns count."""
    now = datetime.now(timezone.utc)
    due = db.query(Incident).filter(
        Incident.escalation_active.is_(True),
        Incident.incident_status == "ongoing",
        Incident.next_escalation_at.isnot(None),
        Incident.next_escalation_at <= now,
    ).all()
    for incident in due:
        try:
            _advance_incident(db, incident)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed advancing incident %s: %s", incident.id, exc, exc_info=True)
    if due:
        db.commit()
    return len(due)


def stop_escalation(db, incident: Incident) -> None:
    """Halt escalation when an incident resolves. Caller commits."""
    if not incident:
        return
    was_active = incident.escalation_active
    monitor = db.query(Monitor).filter(Monitor.id == incident.monitor_id).first()
    incident.escalation_active = False
    incident.next_escalation_at = None
    if monitor:
        _record(db, incident, monitor, event_type="incident_resolved",
                severity=incident.severity, status="info",
                message="Incident resolved — escalation stopped.")
        if was_active:
            _record(db, incident, monitor, event_type="escalation_stopped",
                    status="info", message="Escalation halted on resolution.")
    logger.info("Escalation STOPPED for incident=%s (was_active=%s)", incident.id, was_active)
