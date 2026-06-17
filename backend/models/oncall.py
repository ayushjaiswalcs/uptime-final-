from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text, JSON, Time
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class OnCallSchedule(Base):
    __tablename__ = "oncall_schedules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    timezone = Column(String(100), default="UTC")
    rotation_type = Column(String(50), default="weekly")  # daily, weekly, custom
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    rotations = relationship("OnCallRotation", back_populates="schedule", cascade="all, delete-orphan")
    overrides = relationship("OnCallOverride", back_populates="schedule", cascade="all, delete-orphan")


class OnCallRotation(Base):
    __tablename__ = "oncall_rotations"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("oncall_schedules.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, default=0)
    start_date = Column(DateTime(timezone=True), nullable=True)

    schedule = relationship("OnCallSchedule", back_populates="rotations")
    user = relationship("User")


class OnCallOverride(Base):
    __tablename__ = "oncall_overrides"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("oncall_schedules.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    reason = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    schedule = relationship("OnCallSchedule", back_populates="overrides")
    user = relationship("User")


class EscalationPolicy(Base):
    __tablename__ = "escalation_policies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    repeat_count = Column(Integer, default=3)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    steps = relationship("EscalationStep", back_populates="policy", cascade="all, delete-orphan", order_by="EscalationStep.step_order")


class EscalationStep(Base):
    __tablename__ = "escalation_steps"

    id = Column(Integer, primary_key=True, index=True)
    policy_id = Column(Integer, ForeignKey("escalation_policies.id", ondelete="CASCADE"), nullable=False)
    step_order = Column(Integer, nullable=False)
    delay_minutes = Column(Integer, default=5)
    notify_type = Column(String(50), default="user")  # user, schedule, webhook
    notify_target_id = Column(Integer, nullable=True)
    notify_via = Column(JSON, default=list)  # ["email", "sms", "slack"]

    policy = relationship("EscalationPolicy", back_populates="steps")
