from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class OrgCreate(BaseModel):
    name: str
    slug: str
    logo_url: Optional[str] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None


class MemberOut(BaseModel):
    id: int
    user_id: int
    org_id: int
    role: str
    joined_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None

    class Config:
        from_attributes = True


class OrgOut(BaseModel):
    id: int
    name: str
    slug: str
    owner_id: int
    logo_url: Optional[str]
    plan: str
    created_at: datetime

    class Config:
        from_attributes = True


class InviteMember(BaseModel):
    email: str
    role: str = "developer"


class UpdateMemberRole(BaseModel):
    role: str
