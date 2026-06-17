from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Runbook(Base):
    __tablename__ = "runbooks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(255), nullable=False)
    category = Column(String(100), default="general")  # incident, troubleshooting, deployment, playbook
    content = Column(Text, nullable=False)
    tags = Column(JSON, default=list)
    severity_level = Column(String(50), nullable=True)  # low, medium, high, critical
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="SET NULL"), nullable=True)
    is_published = Column(Boolean, default=True)
    view_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")
    monitor = relationship("Monitor")
    steps = relationship("RunbookStep", back_populates="runbook", cascade="all, delete-orphan", order_by="RunbookStep.step_order")


class RunbookStep(Base):
    __tablename__ = "runbook_steps"

    id = Column(Integer, primary_key=True, index=True)
    runbook_id = Column(Integer, ForeignKey("runbooks.id", ondelete="CASCADE"), nullable=False)
    step_order = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    command = Column(Text, nullable=True)
    expected_output = Column(Text, nullable=True)
    step_type = Column(String(50), default="manual")  # manual, automated, verification

    runbook = relationship("Runbook", back_populates="steps")
