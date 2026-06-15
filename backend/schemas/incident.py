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
    monitor_name: Optional[str] = None

    class Config:
        from_attributes = True
