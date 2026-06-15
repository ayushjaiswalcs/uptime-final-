from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class StatusPage(Base):
    __tablename__ = "status_pages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    company_name = Column(String(255), nullable=False)
    logo_url = Column(String(500), nullable=True)
    custom_domain = Column(String(255), nullable=True)
    is_public = Column(Boolean, default=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="status_pages")
