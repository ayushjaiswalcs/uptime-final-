from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from core.deps import get_db, require_admin
from models.user import User
from models.monitor import Monitor
from schemas.user import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).all()


@router.get("/stats")
def platform_stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {
        "total_users": db.query(User).count(),
        "total_monitors": db.query(Monitor).count(),
        "free_users": db.query(User).filter(User.subscription_plan == "free").count(),
        "pro_users": db.query(User).filter(User.subscription_plan == "pro").count(),
        "enterprise_users": db.query(User).filter(User.subscription_plan == "enterprise").count(),
    }


@router.put("/users/{user_id}/plan")
def update_user_plan(user_id: int, plan: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    user.subscription_plan = plan
    db.commit()
    return {"message": f"Plan updated to {plan}"}
