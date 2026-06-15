from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


VALID_EVENTS = [
    "monitor.down", "monitor.up", "incident.created", "incident.resolved",
    "monitor.created", "monitor.deleted",
]


class WebhookCreate(BaseModel):
    name: str
    url: str
    secret: Optional[str] = None
    events: Optional[List[str]] = None  # subset of VALID_EVENTS; None = all events


class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    secret: Optional[str] = None
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None


class WebhookOut(BaseModel):
    id: int
    user_id: int
    name: str
    url: str
    events: Optional[str]
    is_active: bool
    last_triggered_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class DeliveryOut(BaseModel):
    id: int
    endpoint_id: int
    event: str
    response_status: Optional[int]
    success: bool
    delivered_at: datetime

    class Config:
        from_attributes = True
