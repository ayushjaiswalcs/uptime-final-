from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None
    lead_id: Optional[int] = None
    color: Optional[str] = "#4F46E5"


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    lead_id: Optional[int] = None
    color: Optional[str] = None
    status: Optional[str] = None


class TeamMembershipOut(BaseModel):
    id: int
    team_id: int
    user_id: int
    role: str
    joined_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None

    class Config:
        from_attributes = True


class TeamOut(BaseModel):
    id: int
    org_id: int
    name: str
    description: Optional[str]
    lead_id: Optional[int]
    color: Optional[str]
    status: str
    created_at: datetime
    member_count: Optional[int] = 0
    project_count: Optional[int] = 0
    lead_name: Optional[str] = None

    class Config:
        from_attributes = True


class AddTeamMember(BaseModel):
    user_id: int
    role: str = "developer"


class UpdateTeamMemberRole(BaseModel):
    role: str
