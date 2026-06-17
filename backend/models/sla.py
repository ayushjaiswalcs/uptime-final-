from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class SLAPolicy(Base):
    __tablename__ = "sla_policies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    availability_target = Column(Float, default=99.9)  # e.g. 99.9 = 99.9%
    response_time_target = Column(Integer, default=200)  # ms
    error_rate_target = Column(Float, default=0.1)  # percent
    window_days = Column(Integer, default=30)  # rolling window
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    monitor_slas = relationship("MonitorSLA", back_populates="policy", cascade="all, delete-orphan")


class MonitorSLA(Base):
    __tablename__ = "monitor_slas"

    id = Column(Integer, primary_key=True, index=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False)
    policy_id = Column(Integer, ForeignKey("sla_policies.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    policy = relationship("SLAPolicy", back_populates="monitor_slas")
    monitor = relationship("Monitor")


class SLODefinition(Base):
    __tablename__ = "slo_definitions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    metric_type = Column(String(50), nullable=False)  # availability, latency, error_rate
    target_value = Column(Float, nullable=False)
    window_days = Column(Integer, default=30)
    error_budget_minutes = Column(Float, nullable=True)  # computed
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    monitor = relationship("Monitor")
