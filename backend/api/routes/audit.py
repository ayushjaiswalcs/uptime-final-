from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user, require_admin
from models.audit_log import AuditLog
from models.user import User
from schemas.audit_log import AuditLogOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=List[AuditLogOut])
def list_audit_logs(
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    action: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AuditLog).filter(AuditLog.user_id == current_user.id)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    return q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/admin", response_model=List[AuditLogOut])
def admin_audit_logs(
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    action: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    return q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
