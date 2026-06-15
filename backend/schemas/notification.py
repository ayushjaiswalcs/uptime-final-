from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class NotificationCreate(BaseModel):
    notification_type: str
    destination: str
    enabled: bool = True


class NotificationUpdate(BaseModel):
    destination: Optional[str] = None
    enabled: Optional[bool] = None


class NotificationOut(BaseModel):
    id: int
    user_id: int
    notification_type: str
    destination: str
    enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True
