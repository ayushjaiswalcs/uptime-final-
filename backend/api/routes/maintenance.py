import json
from typing import List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user
from models.maintenance_window import MaintenanceWindow
from models.user import User
from schemas.maintenance import MaintenanceCreate, MaintenanceUpdate, MaintenanceOut

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


@router.get("", response_model=List[MaintenanceOut])
def list_windows(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(MaintenanceWindow)
        .filter(MaintenanceWindow.user_id == current_user.id)
        .order_by(MaintenanceWindow.starts_at.desc())
        .all()
    )


@router.post("", response_model=MaintenanceOut, status_code=201)
def create_window(data: MaintenanceCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if data.ends_at <= data.starts_at:
        raise HTTPException(status_code=422, detail="ends_at must be after starts_at")
    window = MaintenanceWindow(
        user_id=current_user.id,
        name=data.name,
        description=data.description,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        is_recurring=data.is_recurring,
        recurrence_cron=data.recurrence_cron,
        affected_monitors=json.dumps(data.monitor_ids) if data.monitor_ids else None,
    )
    db.add(window)
    db.commit()
    db.refresh(window)
    return window


@router.get("/active")
def active_windows(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    windows = (
        db.query(MaintenanceWindow)
        .filter(
            MaintenanceWindow.user_id == current_user.id,
            MaintenanceWindow.starts_at <= now,
            MaintenanceWindow.ends_at >= now,
        )
        .all()
    )
    return [MaintenanceOut.model_validate(w) for w in windows]


@router.get("/{window_id}", response_model=MaintenanceOut)
def get_window(window_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    window = _get_window(window_id, current_user.id, db)
    return window


@router.put("/{window_id}", response_model=MaintenanceOut)
def update_window(window_id: int, data: MaintenanceUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    window = _get_window(window_id, current_user.id, db)
    for field, value in data.model_dump(exclude_none=True).items():
        if field == "monitor_ids":
            window.affected_monitors = json.dumps(value) if value else None
        else:
            setattr(window, field, value)
    db.commit()
    db.refresh(window)
    return window


@router.delete("/{window_id}", status_code=204)
def delete_window(window_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    window = _get_window(window_id, current_user.id, db)
    db.delete(window)
    db.commit()


def _get_window(window_id: int, user_id: int, db: Session) -> MaintenanceWindow:
    window = db.query(MaintenanceWindow).filter(MaintenanceWindow.id == window_id, MaintenanceWindow.user_id == user_id).first()
    if not window:
        raise HTTPException(status_code=404, detail="Maintenance window not found")
    return window
