from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class MaintenanceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    is_recurring: bool = False
    recurrence_cron: Optional[str] = None
    monitor_ids: Optional[List[int]] = None  # monitors to pause during window


class MaintenanceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_recurring: Optional[bool] = None
    recurrence_cron: Optional[str] = None
    monitor_ids: Optional[List[int]] = None


class MaintenanceOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: Optional[str]
    starts_at: datetime
    ends_at: datetime
    is_recurring: bool
    recurrence_cron: Optional[str]
    affected_monitors: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
