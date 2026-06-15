from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class ApiKeyCreate(BaseModel):
    name: str
    permissions: Optional[List[str]] = None  # e.g. ["monitors:read","monitors:write"]
    expires_days: Optional[int] = None        # None = never expires


class ApiKeyOut(BaseModel):
    id: int
    user_id: int
    name: str
    key_prefix: str
    permissions: Optional[str]
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ApiKeyCreated(ApiKeyOut):
    """Returned once on creation — includes the full raw key."""
    raw_key: str
