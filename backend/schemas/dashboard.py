from pydantic import BaseModel
from typing import List


class DashboardStats(BaseModel):
    total_monitors: int
    up_monitors: int
    down_monitors: int
    paused_monitors: int
    avg_response_time: float
    overall_uptime: str


class UptimeDataPoint(BaseModel):
    date: str
    uptime: float


class ResponseTimeDataPoint(BaseModel):
    date: str
    response_time: float


class StatusPageCreate(BaseModel):
    slug: str
    company_name: str
    logo_url: str = ""
    description: str = ""


class StatusPageOut(BaseModel):
    id: int
    user_id: int
    slug: str
    company_name: str
    logo_url: str = ""
    description: str = ""
    is_public: bool

    class Config:
        from_attributes = True
