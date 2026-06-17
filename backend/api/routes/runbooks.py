from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from core.deps import get_db, get_current_user
from models.user import User
from models.runbook import Runbook, RunbookStep

router = APIRouter(prefix="/runbooks", tags=["runbooks"])


class StepCreate(BaseModel):
    step_order: int
    title: str
    description: Optional[str] = None
    command: Optional[str] = None
    expected_output: Optional[str] = None
    step_type: str = "manual"


class RunbookCreate(BaseModel):
    title: str
    category: str = "general"
    content: str
    tags: List[str] = []
    severity_level: Optional[str] = None
    monitor_id: Optional[int] = None
    is_published: bool = True
    steps: List[StepCreate] = []


class RunbookUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    severity_level: Optional[str] = None
    is_published: Optional[bool] = None


class StepOut(BaseModel):
    id: int
    runbook_id: int
    step_order: int
    title: str
    description: Optional[str]
    command: Optional[str]
    expected_output: Optional[str]
    step_type: str

    class Config:
        from_attributes = True


class RunbookOut(BaseModel):
    id: int
    title: str
    category: str
    content: str
    tags: List[str]
    severity_level: Optional[str]
    monitor_id: Optional[int]
    is_published: bool
    view_count: int
    created_at: datetime
    updated_at: Optional[datetime]
    steps: List[StepOut] = []

    class Config:
        from_attributes = True


@router.get("", response_model=List[RunbookOut])
def list_runbooks(
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(Runbook).filter(Runbook.user_id == current_user.id)
    if category:
        q = q.filter(Runbook.category == category)
    if search:
        q = q.filter(Runbook.title.ilike(f"%{search}%"))
    return q.order_by(Runbook.created_at.desc()).all()


@router.post("", response_model=RunbookOut)
def create_runbook(body: RunbookCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    steps_data = body.steps
    rb_data = body.model_dump(exclude={"steps"})
    rb = Runbook(user_id=current_user.id, **rb_data)
    db.add(rb)
    db.flush()
    for s in steps_data:
        db.add(RunbookStep(runbook_id=rb.id, **s.model_dump()))
    db.commit()
    db.refresh(rb)
    return rb


@router.get("/{runbook_id}", response_model=RunbookOut)
def get_runbook(runbook_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rb = db.query(Runbook).filter(Runbook.id == runbook_id, Runbook.user_id == current_user.id).first()
    if not rb:
        raise HTTPException(status_code=404, detail="Runbook not found")
    rb.view_count += 1
    db.commit()
    db.refresh(rb)
    return rb


@router.put("/{runbook_id}", response_model=RunbookOut)
def update_runbook(runbook_id: int, body: RunbookUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rb = db.query(Runbook).filter(Runbook.id == runbook_id, Runbook.user_id == current_user.id).first()
    if not rb:
        raise HTTPException(status_code=404, detail="Runbook not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rb, field, value)
    db.commit()
    db.refresh(rb)
    return rb


@router.delete("/{runbook_id}")
def delete_runbook(runbook_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rb = db.query(Runbook).filter(Runbook.id == runbook_id, Runbook.user_id == current_user.id).first()
    if not rb:
        raise HTTPException(status_code=404, detail="Runbook not found")
    db.delete(rb)
    db.commit()
    return {"ok": True}


@router.get("/stats/summary")
def runbook_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    runbooks = db.query(Runbook).filter(Runbook.user_id == current_user.id).all()
    by_category: dict = {}
    total_views = 0
    for rb in runbooks:
        by_category[rb.category] = by_category.get(rb.category, 0) + 1
        total_views += rb.view_count
    return {
        "total": len(runbooks),
        "published": sum(1 for rb in runbooks if rb.is_published),
        "total_views": total_views,
        "by_category": by_category,
    }
