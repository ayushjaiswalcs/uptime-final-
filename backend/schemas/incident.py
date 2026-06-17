from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class IncidentOut(BaseModel):
    id: int
    monitor_id: int
    outage_start_time: datetime
    recovery_time: Optional[datetime]
    error_message: Optional[str]
    incident_status: str
    severity: Optional[str] = "medium"
    title: Optional[str] = None
    assigned_user_id: Optional[int] = None
    assigned_team_id: Optional[int] = None
    root_cause: Optional[str] = None
    monitor_name: Optional[str] = None

    class Config:
        from_attributes = True
