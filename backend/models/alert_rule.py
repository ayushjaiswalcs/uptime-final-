from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=True)  # None = global rule
    name = Column(String(255), nullable=False)
    consecutive_failures = Column(Integer, default=1)      # alert after X consecutive failures
    recovery_confirmations = Column(Integer, default=1)    # confirm recovery after X successes
    silence_minutes = Column(Integer, default=0)           # re-alert cooldown in minutes
    escalation_after_minutes = Column(Integer, nullable=True)  # escalate after N minutes down
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="alert_rules")
