"""Default escalation matrix seeding.

Builds the spec'd NORMAL / WARNING / CRITICAL default policies (monitor_id NULL =
applies to all monitors of that severity) for a user who has none. Idempotent:
re-running only fills gaps, never duplicates.

Matrix (timer NULL = final level):

NORMAL
  L1 On-call Engineer        15m   web
  L2 Team Lead               NULL  web, whatsapp

WARNING
  L1 On-call Engineer         5m   web, email
  L2 Team Lead               10m   web, whatsapp, email
  L3 Engineering Manager     NULL  web, whatsapp, sms, email

CRITICAL  (all channels on)
  L1 On-call Engineer         3m   web, whatsapp, sms, call, email, webhook
  L2 Lead + Backup Engineer   5m   web, whatsapp, sms, call, email, webhook
  L3 Engineering Manager     NULL  web, whatsapp, sms, call, email, webhook
"""
import logging

from models.user import User
from models.escalation import EscalationConfig, EscalationLevel, EscalationChannel, CHANNELS

logger = logging.getLogger("uptime.escalation.seed")

ALL_ON = {ch: True for ch in CHANNELS}

# severity -> (config name, [ (level_no, name, timer, {channel: enabled}) ])
DEFAULT_MATRIX = {
    "NORMAL": ("Default NORMAL Policy", [
        (1, "L1 On-call Engineer", 15, {"web": True}),
        (2, "L2 Team Lead", None, {"web": True, "whatsapp": True}),
    ]),
    "WARNING": ("Default WARNING Policy", [
        (1, "L1 On-call Engineer", 5, {"web": True, "email": True}),
        (2, "L2 Team Lead", 10, {"web": True, "whatsapp": True, "email": True}),
        (3, "L3 Engineering Manager", None, {"web": True, "whatsapp": True, "sms": True, "email": True}),
    ]),
    "CRITICAL": ("Default CRITICAL Policy", [
        (1, "L1 On-call Engineer", 3, ALL_ON),
        (2, "L2 Lead + Backup Engineer", 5, ALL_ON),
        (3, "L3 Engineering Manager", None, ALL_ON),
    ]),
}


def seed_default_matrix_for_user(db, user_id: int) -> int:
    """Create any missing default (monitor_id NULL) configs for one user.

    Returns the number of configs created.
    """
    created = 0
    for severity, (name, levels) in DEFAULT_MATRIX.items():
        exists = db.query(EscalationConfig).filter(
            EscalationConfig.user_id == user_id,
            EscalationConfig.severity == severity,
            EscalationConfig.monitor_id.is_(None),
            EscalationConfig.is_default.is_(True),
        ).first()
        if exists:
            continue

        config = EscalationConfig(
            user_id=user_id,
            monitor_id=None,
            name=name,
            severity=severity,
            description=f"Auto-seeded default {severity} escalation policy.",
            is_active=True,
            is_default=True,
        )
        db.add(config)
        db.flush()

        for level_no, level_name, timer, channels in levels:
            level = EscalationLevel(
                config_id=config.id,
                level_number=level_no,
                escalation_name=level_name,
                timer_minutes=timer,
                notify_target=level_name,
                is_active=True,
            )
            db.add(level)
            db.flush()
            for ch in CHANNELS:
                db.add(EscalationChannel(level_id=level.id, channel=ch, enabled=channels.get(ch, False)))
        created += 1

    if created:
        db.commit()
        logger.info("Seeded %s default escalation config(s) for user %s", created, user_id)
    return created


def seed_missing_default_matrices(db) -> int:
    """Seed defaults for every user lacking them. Called on startup."""
    total = 0
    for (user_id,) in db.query(User.id).all():
        try:
            total += seed_default_matrix_for_user(db, user_id)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            logger.warning("Seed failed for user %s: %s", user_id, exc)
    return total
