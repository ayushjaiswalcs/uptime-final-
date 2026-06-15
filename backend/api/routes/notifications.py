from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from core.deps import get_db, get_current_user
from models.user import User
from models.notification import Notification
from schemas.notification import NotificationCreate, NotificationUpdate, NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=List[NotificationOut])
def list_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Notification).filter(Notification.user_id == current_user.id).all()


@router.post("", response_model=NotificationOut, status_code=201)
def create_notification(data: NotificationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notif = Notification(user_id=current_user.id, **data.model_dump())
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


@router.put("/{notif_id}", response_model=NotificationOut)
def update_notification(notif_id: int, data: NotificationUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notif = db.query(Notification).filter(Notification.id == notif_id, Notification.user_id == current_user.id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(notif, field, value)
    db.commit()
    db.refresh(notif)
    return notif


@router.delete("/{notif_id}", status_code=204)
def delete_notification(notif_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notif = db.query(Notification).filter(Notification.id == notif_id, Notification.user_id == current_user.id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(notif)
    db.commit()
