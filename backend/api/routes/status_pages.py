from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from core.deps import get_db, get_current_user
from models.user import User
from models.monitor import Monitor
from models.monitor_log import MonitorLog
from models.status_page import StatusPage
from models.incident import Incident
from schemas.dashboard import StatusPageCreate, StatusPageOut
from datetime import datetime, timedelta, timezone
from sqlalchemy import func
import re

router = APIRouter(prefix="/status-pages", tags=["status-pages"])


@router.get("", response_model=List[StatusPageOut])
def list_status_pages(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(StatusPage).filter(StatusPage.user_id == current_user.id).all()


@router.post("", response_model=StatusPageOut, status_code=201)
def create_status_page(data: StatusPageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not re.match(r'^[a-z0-9-]+$', data.slug):
        raise HTTPException(status_code=400, detail="Slug must contain only lowercase letters, numbers, and hyphens")
    if db.query(StatusPage).filter(StatusPage.slug == data.slug).first():
        raise HTTPException(status_code=400, detail="Slug already taken")
    page = StatusPage(user_id=current_user.id, **data.model_dump())
    db.add(page)
    db.commit()
    db.refresh(page)
    return page


@router.delete("/{page_id}", status_code=204)
def delete_status_page(page_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    page = db.query(StatusPage).filter(StatusPage.id == page_id, StatusPage.user_id == current_user.id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Status page not found")
    db.delete(page)
    db.commit()


@router.get("/public/{slug}")
def get_public_status_page(slug: str, db: Session = Depends(get_db)):
    page = db.query(StatusPage).filter(StatusPage.slug == slug, StatusPage.is_public == True).first()
    if not page:
        raise HTTPException(status_code=404, detail="Status page not found")

    monitors = db.query(Monitor).filter(Monitor.user_id == page.user_id).all()
    from sqlalchemy import desc
    recent_incidents = (
        db.query(Incident)
        .filter(Incident.monitor_id.in_([m.id for m in monitors]))
        .order_by(desc(Incident.outage_start_time))
        .limit(10)
        .all()
    )

    # Only public-facing monitors are considered "all up" (paused ones are ignored).
    active = [m for m in monitors if not m.is_paused]
    all_up = all(m.current_status == "up" for m in active) if active else True
    uptimes = [float(m.uptime_percentage) for m in monitors if m.uptime_percentage]
    avg_uptime = f"{(sum(uptimes) / len(uptimes)):.2f}" if uptimes else "100.00"

    # Average response time across all checks in the last 24h (real data, not a placeholder).
    monitor_ids = [m.id for m in monitors]
    avg_rt = None
    if monitor_ids:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        avg_rt = (
            db.query(func.avg(MonitorLog.response_time))
            .filter(
                MonitorLog.monitor_id.in_(monitor_ids),
                MonitorLog.checked_at >= since,
                MonitorLog.is_up.is_(True),
            )
            .scalar()
        )

    return {
        "company_name": page.company_name,
        "logo_url": page.logo_url,
        "description": page.description,
        "overall_status": "operational" if all_up else "degraded",
        "avg_uptime": avg_uptime,
        "avg_response_time": round(float(avg_rt), 1) if avg_rt is not None else None,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "monitors": [
            {
                "id": m.id,
                "name": m.monitor_name,
                "status": "paused" if m.is_paused else m.current_status,
                "uptime": m.uptime_percentage,
            }
            for m in monitors
        ],
        "incidents": [
            {
                "id": inc.id,
                "monitor_id": inc.monitor_id,
                "started_at": inc.outage_start_time.isoformat(),
                "resolved_at": inc.recovery_time.isoformat() if inc.recovery_time else None,
                "status": inc.incident_status,
                "error": inc.error_message,
            }
            for inc in recent_incidents
        ],
    }
