"""Escalation Matrix models.

A severity-driven escalation policy: each EscalationConfig belongs to a severity
(NORMAL / WARNING / CRITICAL) and optionally scopes to a single monitor (NULL =
applies to every monitor of that severity for the owner). A config has ordered
EscalationLevels (L1, L2, L3...); each level has a per-channel toggle set
(EscalationChannel: web / whatsapp / sms / call / email / webhook) and a timer
in minutes (NULL timer = final level, escalation stops advancing).

EscalationHistory is the append-only event log for an incident's escalation
timeline AND the notification-log source (event_type='notification_sent').

The live run-state of an escalation (current level, when the next level fires)
lives on the incidents table (see models/incident.py) so we don't add a table
beyond the documented schema.
"""
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Boolean, Text, Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

# Canonical severity + channel vocabularies (kept in code so the API and engine
# share one source of truth).
SEVERITIES = ("NORMAL", "WARNING", "CRITICAL")
CHANNELS = ("web", "whatsapp", "sms", "call", "email", "webhook")


class EscalationConfig(Base):
    __tablename__ = "escalation_configs"

    __table_args__ = (
        # The engine looks up an active config by (user, severity) preferring a
        # monitor-specific row, so index those lookup columns together.
        Index("ix_escalation_configs_user_sev", "user_id", "severity", "is_active"),
        Index("ix_escalation_configs_monitor", "monitor_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    # NULL monitor_id = default policy for this severity (applies to all monitors).
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    severity = Column(String(20), nullable=False, default="NORMAL")  # NORMAL | WARNING | CRITICAL
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="active", server_default="active")  # active | inactive | draft
    is_active = Column(Boolean, default=True, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    levels = relationship(
        "EscalationLevel",
        back_populates="config",
        cascade="all, delete-orphan",
        order_by="EscalationLevel.level_number",
    )


class EscalationLevel(Base):
    __tablename__ = "escalation_levels"

    __table_args__ = (
        UniqueConstraint("config_id", "level_number", name="uq_level_config_number"),
        Index("ix_escalation_levels_config", "config_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("escalation_configs.id", ondelete="CASCADE"), nullable=False)
    level_number = Column(Integer, nullable=False)              # 1, 2, 3...
    escalation_name = Column(String(255), nullable=False)        # "L1 On-call Engineer"
    # NULL timer = final level: notify and stop advancing.
    timer_minutes = Column(Integer, nullable=True)
    notify_target = Column(String(255), nullable=True)           # free-form: role / user / email
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    config = relationship("EscalationConfig", back_populates="levels")
    channels = relationship(
        "EscalationChannel",
        back_populates="level",
        cascade="all, delete-orphan",
    )


class EscalationChannel(Base):
    __tablename__ = "escalation_channels"

    __table_args__ = (
        UniqueConstraint("level_id", "channel", name="uq_channel_level_name"),
        Index("ix_escalation_channels_level", "level_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    level_id = Column(Integer, ForeignKey("escalation_levels.id", ondelete="CASCADE"), nullable=False)
    channel = Column(String(20), nullable=False)   # web | whatsapp | sms | call | email | webhook
    enabled = Column(Boolean, default=False, nullable=False)

    level = relationship("EscalationLevel", back_populates="channels")


class EscalationHistory(Base):
    __tablename__ = "escalation_history"

    __table_args__ = (
        # Timeline queries filter by incident and sort by time; the notification
        # log filters by user + event_type.
        Index("ix_escalation_history_incident", "incident_id", "created_at"),
        Index("ix_escalation_history_user_event", "user_id", "event_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    config_id = Column(Integer, ForeignKey("escalation_configs.id", ondelete="SET NULL"), nullable=True)
    level_id = Column(Integer, ForeignKey("escalation_levels.id", ondelete="SET NULL"), nullable=True)
    # incident_created | escalation_triggered | notification_sent
    # | level_changed | incident_resolved | escalation_stopped
    event_type = Column(String(40), nullable=False)
    severity = Column(String(20), nullable=True)
    level_number = Column(Integer, nullable=True)
    channel = Column(String(20), nullable=True)          # set for notification_sent rows
    target = Column(String(255), nullable=True)
    status = Column(String(20), nullable=True, default="info")  # info | sent | failed | skipped | acknowledged
    message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
