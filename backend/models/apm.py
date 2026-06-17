from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Text, JSON, Index, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class APMTransaction(Base):
    __tablename__ = "apm_transactions"

    __table_args__ = (
        Index("ix_apm_tx_monitor_time", "monitor_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    transaction_name = Column(String(255), nullable=False)
    duration_ms = Column(Float, nullable=False)
    status_code = Column(Integer, nullable=True)
    is_error = Column(Boolean, default=False)
    error_message = Column(Text, nullable=True)
    trace_id = Column(String(64), nullable=True, index=True)
    span_data = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    monitor = relationship("Monitor")


class APMError(Base):
    __tablename__ = "apm_errors"

    id = Column(Integer, primary_key=True, index=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    error_type = Column(String(255), nullable=False)
    error_message = Column(Text, nullable=True)
    stack_trace = Column(Text, nullable=True)
    count = Column(Integer, default=1)
    first_seen = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    is_resolved = Column(Boolean, default=False)

    monitor = relationship("Monitor")


class WebVital(Base):
    __tablename__ = "web_vitals"

    __table_args__ = (
        Index("ix_web_vitals_monitor_time", "monitor_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lcp = Column(Float, nullable=True)   # Largest Contentful Paint (ms)
    fid = Column(Float, nullable=True)   # First Input Delay (ms)
    cls = Column(Float, nullable=True)   # Cumulative Layout Shift
    ttfb = Column(Float, nullable=True)  # Time to First Byte (ms)
    fcp = Column(Float, nullable=True)   # First Contentful Paint (ms)
    page_url = Column(String(500), nullable=True)
    country = Column(String(100), nullable=True)
    browser = Column(String(100), nullable=True)
    device_type = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    monitor = relationship("Monitor")
