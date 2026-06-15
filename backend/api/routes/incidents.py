from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime, timezone
from core.deps import get_db, get_current_user
from models.user import User
from models.monitor import Monitor
from models.incident import Incident
from schemas.incident import IncidentOut

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("", response_model=List[IncidentOut])
def list_incidents(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    monitor_ids = [m.id for m in db.query(Monitor).filter(Monitor.user_id == current_user.id).all()]
    query = db.query(Incident).filter(Incident.monitor_id.in_(monitor_ids))
    if status:
        query = query.filter(Incident.incident_status == status)
    incidents = query.order_by(desc(Incident.outage_start_time)).limit(100).all()

    result = []
    for inc in incidents:
        monitor = db.query(Monitor).filter(Monitor.id == inc.monitor_id).first()
        out = IncidentOut.model_validate(inc)
        out.monitor_name = monitor.monitor_name if monitor else "Unknown"
        result.append(out)
    return result


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    monitor = db.query(Monitor).filter(Monitor.id == incident.monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=403, detail="Access denied")
    out = IncidentOut.model_validate(incident)
    out.monitor_name = monitor.monitor_name
    return out


@router.post("/{incident_id}/resolve", response_model=IncidentOut)
def resolve_incident(incident_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    monitor = db.query(Monitor).filter(Monitor.id == incident.monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=403, detail="Access denied")
    incident.incident_status = "resolved"
    incident.recovery_time = datetime.now(timezone.utc)
    db.commit()
    db.refresh(incident)
    out = IncidentOut.model_validate(incident)
    out.monitor_name = monitor.monitor_name
    return out
