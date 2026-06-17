from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user
from models.comment import Comment
from models.monitor import Monitor
from models.user import User

router = APIRouter(prefix="/monitors", tags=["comments"])


class CommentCreate(BaseModel):
    content: str


class CommentOut(BaseModel):
    id: int
    monitor_id: int
    user_id: int
    content: str
    created_at: str
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/{monitor_id}/comments", response_model=List[CommentOut])
def list_comments(monitor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    comments = db.query(Comment).filter(Comment.monitor_id == monitor_id).order_by(Comment.created_at.desc()).all()
    result = []
    for c in comments:
        user = db.query(User).filter(User.id == c.user_id).first()
        result.append(CommentOut(
            id=c.id,
            monitor_id=c.monitor_id,
            user_id=c.user_id,
            content=c.content,
            created_at=c.created_at.isoformat() if c.created_at else "",
            user_name=user.name if user else None,
        ))
    return result


@router.post("/{monitor_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(monitor_id: int, data: CommentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    if not data.content.strip():
        raise HTTPException(status_code=422, detail="Comment cannot be empty")
    comment = Comment(monitor_id=monitor_id, user_id=current_user.id, content=data.content.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return CommentOut(
        id=comment.id,
        monitor_id=comment.monitor_id,
        user_id=comment.user_id,
        content=comment.content,
        created_at=comment.created_at.isoformat() if comment.created_at else "",
        user_name=current_user.name,
    )


@router.delete("/{monitor_id}/comments/{comment_id}", status_code=204)
def delete_comment(monitor_id: int, comment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    comment = db.query(Comment).filter(Comment.id == comment_id, Comment.monitor_id == monitor_id, Comment.user_id == current_user.id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.delete(comment)
    db.commit()
