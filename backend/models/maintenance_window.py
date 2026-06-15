from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class MaintenanceWindow(Base):
    __tablename__ = "maintenance_windows"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    starts_at = Column(DateTime(timezone=True), nullable=False)
    ends_at = Column(DateTime(timezone=True), nullable=False)
    is_recurring = Column(Boolean, default=False)
    recurrence_cron = Column(String(100), nullable=True)  # cron expression e.g. "0 2 * * 0"
    affected_monitors = Column(Text, nullable=True)       # JSON: [1, 2, 3] monitor IDs
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="maintenance_windows")
