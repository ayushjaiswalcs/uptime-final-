from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Incident(Base):
    __tablename__ = "incidents"

    # Recent-incident listings filter by monitor_id and sort by start time;
    # the resolve path looks up the open ("ongoing") incident per monitor.
    __table_args__ = (
        Index("ix_incidents_monitor_start", "monitor_id", "outage_start_time"),
        Index("ix_incidents_monitor_status", "monitor_id", "incident_status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False)
    outage_start_time = Column(DateTime(timezone=True), server_default=func.now())
    recovery_time = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    incident_status = Column(String(20), default="ongoing")  # ongoing, resolved, acknowledged
    severity = Column(String(20), default="medium")  # low, medium, high, critical
    assigned_team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    root_cause = Column(Text, nullable=True)
    title = Column(String(255), nullable=True)

    monitor = relationship("Monitor", back_populates="incidents")
    assigned_team = relationship("Team", foreign_keys=[assigned_team_id])
    assigned_user = relationship("User", foreign_keys=[assigned_user_id])
