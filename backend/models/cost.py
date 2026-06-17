from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Text, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class CloudCostEntry(Base):
    __tablename__ = "cloud_cost_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    provider = Column(String(50), nullable=False)  # aws, azure, gcp
    service = Column(String(100), nullable=False)   # EC2, RDS, S3, etc.
    resource_id = Column(String(255), nullable=True)
    resource_name = Column(String(255), nullable=True)
    region = Column(String(100), nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="USD")
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False)
    tags = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BudgetAlert(Base):
    __tablename__ = "budget_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    provider = Column(String(50), nullable=True)  # null = all providers
    service = Column(String(100), nullable=True)
    budget_amount = Column(Float, nullable=False)
    alert_threshold = Column(Float, default=80.0)  # percent
    period = Column(String(20), default="monthly")
    is_active = Column(Boolean, default=True)
    last_triggered = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ResourceInventory(Base):
    __tablename__ = "resource_inventory"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    provider = Column(String(50), nullable=False)
    resource_type = Column(String(100), nullable=False)  # server, database, loadbalancer, etc.
    resource_id = Column(String(255), nullable=False)
    resource_name = Column(String(255), nullable=True)
    region = Column(String(100), nullable=True)
    status = Column(String(50), default="running")
    owner = Column(String(255), nullable=True)
    tags = Column(JSON, default=dict)
    monthly_cost = Column(Float, nullable=True)
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
