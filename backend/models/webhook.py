from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    url = Column(String(1000), nullable=False)
    secret = Column(String(255), nullable=True)     # HMAC-SHA256 signing secret
    # JSON list: ["monitor.down","monitor.up","incident.created","incident.resolved"]
    events = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="webhook_endpoints")
    deliveries = relationship("WebhookDelivery", back_populates="endpoint", cascade="all, delete-orphan")


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    endpoint_id = Column(Integer, ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), nullable=False)
    event = Column(String(50), nullable=False)
    payload = Column(Text, nullable=True)           # JSON payload sent
    response_status = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    success = Column(Boolean, default=False)
    delivered_at = Column(DateTime(timezone=True), server_default=func.now())

    endpoint = relationship("WebhookEndpoint", back_populates="deliveries")
