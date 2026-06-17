from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text, JSON, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class ComplianceFramework(Base):
    __tablename__ = "compliance_frameworks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # SOC2, ISO27001, GDPR, HIPAA
    description = Column(Text, nullable=True)
    version = Column(String(50), nullable=True)

    controls = relationship("ComplianceControl", back_populates="framework", cascade="all, delete-orphan")


class ComplianceControl(Base):
    __tablename__ = "compliance_controls"

    id = Column(Integer, primary_key=True, index=True)
    framework_id = Column(Integer, ForeignKey("compliance_frameworks.id", ondelete="CASCADE"), nullable=False)
    control_id = Column(String(50), nullable=False)   # e.g. CC6.1
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)

    framework = relationship("ComplianceFramework", back_populates="controls")
    assessments = relationship("ComplianceAssessment", back_populates="control")


class ComplianceAssessment(Base):
    __tablename__ = "compliance_assessments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    control_id = Column(Integer, ForeignKey("compliance_controls.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="not_started")  # not_started, in_progress, compliant, non_compliant, na
    evidence = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    assessed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    assessed_at = Column(DateTime(timezone=True), nullable=True)
    next_review = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    control = relationship("ComplianceControl", back_populates="assessments")
    assessor = relationship("User", foreign_keys=[assessed_by])


class DataRetentionPolicy(Base):
    __tablename__ = "data_retention_policies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    data_type = Column(String(100), nullable=False)  # monitor_logs, audit_logs, incidents, etc.
    retention_days = Column(Integer, nullable=False)
    auto_delete = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
