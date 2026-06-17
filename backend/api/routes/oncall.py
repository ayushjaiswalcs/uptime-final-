from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel

from core.deps import get_db, get_current_user
from models.user import User
from models.oncall import OnCallSchedule, OnCallRotation, OnCallOverride, EscalationPolicy, EscalationStep

router = APIRouter(prefix="/oncall", tags=["oncall"])


class ScheduleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    timezone: str = "UTC"
    rotation_type: str = "weekly"


class RotationCreate(BaseModel):
    user_id: int
    order_index: int = 0


class OverrideCreate(BaseModel):
    user_id: int
    start_time: datetime
    end_time: datetime
    reason: Optional[str] = None


class EscalationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    repeat_count: int = 3


class EscalationStepCreate(BaseModel):
    step_order: int
    delay_minutes: int = 5
    notify_type: str = "user"
    notify_target_id: Optional[int] = None
    notify_via: List[str] = ["email"]


class ScheduleOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    timezone: str
    rotation_type: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class RotationOut(BaseModel):
    id: int
    schedule_id: int
    user_id: int
    order_index: int
    user_name: Optional[str] = None
    user_email: Optional[str] = None

    class Config:
        from_attributes = True


class OverrideOut(BaseModel):
    id: int
    schedule_id: int
    user_id: int
    start_time: datetime
    end_time: datetime
    reason: Optional[str]
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


class EscalationOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    repeat_count: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/schedules", response_model=List[ScheduleOut])
def list_schedules(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(OnCallSchedule).filter(OnCallSchedule.user_id == current_user.id).all()


@router.post("/schedules", response_model=ScheduleOut)
def create_schedule(body: ScheduleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    schedule = OnCallSchedule(user_id=current_user.id, **body.model_dump())
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(OnCallSchedule).filter(OnCallSchedule.id == schedule_id, OnCallSchedule.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.get("/schedules/{schedule_id}/rotations")
def list_rotations(schedule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rotations = db.query(OnCallRotation).options(joinedload(OnCallRotation.user)).filter(
        OnCallRotation.schedule_id == schedule_id
    ).order_by(OnCallRotation.order_index).all()
    result = []
    for r in rotations:
        result.append({
            "id": r.id,
            "schedule_id": r.schedule_id,
            "user_id": r.user_id,
            "order_index": r.order_index,
            "user_name": r.user.name if r.user else None,
            "user_email": r.user.email if r.user else None,
        })
    return result


@router.post("/schedules/{schedule_id}/rotations")
def add_rotation(schedule_id: int, body: RotationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = OnCallRotation(schedule_id=schedule_id, **body.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.delete("/rotations/{rotation_id}")
def delete_rotation(rotation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = db.query(OnCallRotation).filter(OnCallRotation.id == rotation_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.get("/schedules/{schedule_id}/overrides")
def list_overrides(schedule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    overrides = db.query(OnCallOverride).options(joinedload(OnCallOverride.user)).filter(
        OnCallOverride.schedule_id == schedule_id
    ).all()
    result = []
    for o in overrides:
        result.append({
            "id": o.id,
            "schedule_id": o.schedule_id,
            "user_id": o.user_id,
            "start_time": o.start_time,
            "end_time": o.end_time,
            "reason": o.reason,
            "user_name": o.user.name if o.user else None,
        })
    return result


@router.post("/schedules/{schedule_id}/overrides")
def add_override(schedule_id: int, body: OverrideCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    o = OnCallOverride(schedule_id=schedule_id, **body.model_dump())
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


@router.get("/escalations", response_model=List[EscalationOut])
def list_escalations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(EscalationPolicy).filter(EscalationPolicy.user_id == current_user.id).all()


@router.post("/escalations", response_model=EscalationOut)
def create_escalation(body: EscalationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    policy = EscalationPolicy(user_id=current_user.id, **body.model_dump())
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.delete("/escalations/{policy_id}")
def delete_escalation(policy_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(EscalationPolicy).filter(EscalationPolicy.id == policy_id, EscalationPolicy.user_id == current_user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.get("/escalations/{policy_id}/steps")
def list_steps(policy_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(EscalationStep).filter(EscalationStep.policy_id == policy_id).order_by(EscalationStep.step_order).all()


@router.post("/escalations/{policy_id}/steps")
def add_step(policy_id: int, body: EscalationStepCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    step = EscalationStep(policy_id=policy_id, **body.model_dump())
    db.add(step)
    db.commit()
    db.refresh(step)
    return step
