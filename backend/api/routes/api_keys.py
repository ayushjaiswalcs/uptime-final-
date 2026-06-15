import json
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user
from core.security import hash_password, verify_password
from models.api_key import ApiKey
from models.user import User
from schemas.api_key import ApiKeyCreate, ApiKeyOut, ApiKeyCreated

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def _generate_raw_key() -> str:
    alphabet = string.ascii_letters + string.digits
    return "upk_" + "".join(secrets.choice(alphabet) for _ in range(40))


@router.get("", response_model=List[ApiKeyOut])
def list_api_keys(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(ApiKey).filter(ApiKey.user_id == current_user.id).order_by(ApiKey.created_at.desc()).all()


@router.post("", response_model=ApiKeyCreated, status_code=201)
def create_api_key(
    data: ApiKeyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw_key = _generate_raw_key()
    expires_at = None
    if data.expires_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_days)
    perms_json = json.dumps(data.permissions) if data.permissions else None
    key = ApiKey(
        user_id=current_user.id,
        name=data.name,
        key_prefix=raw_key[:12],
        key_hash=hash_password(raw_key),
        permissions=perms_json,
        expires_at=expires_at,
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    out = ApiKeyCreated.model_validate(key)
    out.raw_key = raw_key
    return out


@router.delete("/{key_id}", status_code=204)
def revoke_api_key(key_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == current_user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    db.delete(key)
    db.commit()


@router.patch("/{key_id}/toggle")
def toggle_api_key(key_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == current_user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    key.is_active = not key.is_active
    db.commit()
    return {"is_active": key.is_active}
