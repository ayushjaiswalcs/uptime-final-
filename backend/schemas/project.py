from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional, List


class ProjectCreate(BaseModel):
    name: str
    org_id: int
    team_id: Optional[int] = None
    description: Optional[str] = None
    status: Optional[str] = "active"
    priority: Optional[str] = "medium"
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    team_id: Optional[int] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectMemberOut(BaseModel):
    id: int
    project_id: int
    user_id: int
    role: str
    joined_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectOut(BaseModel):
    id: int
    org_id: int
    team_id: Optional[int]
    name: str
    description: Optional[str]
    status: str
    priority: str
    start_date: Optional[date]
    end_date: Optional[date]
    created_at: datetime
    team_name: Optional[str] = None
    monitor_count: Optional[int] = 0
    member_count: Optional[int] = 0

    class Config:
        from_attributes = True


class AddProjectMember(BaseModel):
    user_id: int
    role: str = "developer"
