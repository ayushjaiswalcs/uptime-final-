from sqlalchemy import Column, Integer, Float, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class MonitorLog(Base):
    __tablename__ = "monitor_logs"

    id = Column(Integer, primary_key=True, index=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False)
    response_time = Column(Float, nullable=True)  # ms
    http_status = Column(Integer, nullable=True)
    is_up = Column(Boolean, nullable=False)
    error_message = Column(String(500), nullable=True)
    checked_at = Column(DateTime(timezone=True), server_default=func.now())

    monitor = relationship("Monitor", back_populates="logs")
