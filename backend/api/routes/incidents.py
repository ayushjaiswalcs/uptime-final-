from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

from core.deps import get_db, get_current_user
from models.user import User
from models.monitor import Monitor
from models.incident import Incident
from schemas.incident import IncidentOut

router = APIRouter(prefix="/incidents", tags=["incidents"])


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    severity: Optional[str] = None
    assigned_user_id: Optional[int] = None
    assigned_team_id: Optional[int] = None
    root_cause: Optional[str] = None


class PostmortemCreate(BaseModel):
    title: str
    summary: str
    timeline: str
    root_cause: str
    impact: str
    action_items: str
    prevention: str


@router.get("", response_model=List[IncidentOut])
def list_incidents(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    monitor_id: Optional[int] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    monitor_ids = [m.id for m in db.query(Monitor).filter(Monitor.user_id == current_user.id).all()]
    query = db.query(Incident).filter(Incident.monitor_id.in_(monitor_ids))
    if status:
        query = query.filter(Incident.incident_status == status)
    if severity:
        query = query.filter(Incident.severity == severity)
    if monitor_id:
        query = query.filter(Incident.monitor_id == monitor_id)
    incidents = query.order_by(desc(Incident.outage_start_time)).limit(limit).all()

    result = []
    for inc in incidents:
        monitor = db.query(Monitor).filter(Monitor.id == inc.monitor_id).first()
        out = IncidentOut.model_validate(inc)
        out.monitor_name = monitor.monitor_name if monitor else "Unknown"
        result.append(out)
    return result


@router.get("/metrics")
def incident_metrics(
    window_days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    monitor_ids = [m.id for m in db.query(Monitor).filter(Monitor.user_id == current_user.id).all()]

    incidents = db.query(Incident).filter(
        Incident.monitor_id.in_(monitor_ids),
        Incident.outage_start_time >= since
    ).all()

    resolved = [i for i in incidents if i.incident_status == "resolved" and i.recovery_time]
    mttr_seconds = 0.0
    if resolved:
        total_seconds = sum(
            (i.recovery_time - i.outage_start_time).total_seconds()
            for i in resolved
        )
        mttr_seconds = total_seconds / len(resolved)

    # MTBF: time between failures
    all_resolved = db.query(Incident).filter(
        Incident.monitor_id.in_(monitor_ids),
        Incident.incident_status == "resolved",
        Incident.recovery_time.isnot(None)
    ).order_by(Incident.outage_start_time).all()

    mtbf_seconds = 0.0
    if len(all_resolved) > 1:
        gaps = []
        for i in range(1, len(all_resolved)):
            gap = (all_resolved[i].outage_start_time - all_resolved[i-1].recovery_time).total_seconds()
            if gap > 0:
                gaps.append(gap)
        if gaps:
            mtbf_seconds = sum(gaps) / len(gaps)

    by_severity = {}
    for inc in incidents:
        sev = inc.severity or "medium"
        by_severity[sev] = by_severity.get(sev, 0) + 1

    return {
        "total": len(incidents),
        "ongoing": sum(1 for i in incidents if i.incident_status == "ongoing"),
        "resolved": len(resolved),
        "mttr_minutes": round(mttr_seconds / 60, 1),
        "mtbf_hours": round(mtbf_seconds / 3600, 1),
        "by_severity": by_severity,
        "window_days": window_days,
    }


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


@router.patch("/{incident_id}")
def update_incident(
    incident_id: int,
    body: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    monitor = db.query(Monitor).filter(Monitor.id == incident.monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=403, detail="Access denied")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(incident, field, value)
    db.commit()
    db.refresh(incident)
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


@router.post("/{incident_id}/acknowledge")
def acknowledge_incident(incident_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Not found")
    monitor = db.query(Monitor).filter(Monitor.id == incident.monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=403, detail="Access denied")
    incident.incident_status = "acknowledged"
    db.commit()
    return {"ok": True}


@router.get("/{incident_id}/timeline")
def incident_timeline(incident_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Not found")
    monitor = db.query(Monitor).filter(Monitor.id == incident.monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=403, detail="Access denied")

    from models.monitor_log import MonitorLog
    # Get check logs around the incident window
    end_time = incident.recovery_time or datetime.now(timezone.utc)
    logs = db.query(MonitorLog).filter(
        MonitorLog.monitor_id == incident.monitor_id,
        MonitorLog.checked_at >= incident.outage_start_time - timedelta(minutes=5),
        MonitorLog.checked_at <= end_time + timedelta(minutes=5)
    ).order_by(MonitorLog.checked_at).all()

    events = [{"time": incident.outage_start_time.isoformat(), "type": "incident_start", "message": f"Incident detected: {incident.error_message or 'Service down'}"}]
    for log in logs:
        events.append({
            "time": log.checked_at.isoformat(),
            "type": "check_result",
            "message": f"Check {log.status}: {log.response_time}ms" if log.response_time else f"Check {log.status}",
            "status": log.status,
        })
    if incident.incident_status == "acknowledged":
        events.append({"time": end_time.isoformat(), "type": "acknowledged", "message": "Incident acknowledged"})
    if incident.recovery_time:
        events.append({"time": incident.recovery_time.isoformat(), "type": "resolved", "message": "Service restored"})

    return {"incident_id": incident_id, "events": sorted(events, key=lambda e: e["time"])}


@router.post("/{incident_id}/postmortem")
def create_postmortem(
    incident_id: int,
    body: PostmortemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Not found")
    monitor = db.query(Monitor).filter(Monitor.id == incident.monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=403, detail="Access denied")
    incident.root_cause = f"POSTMORTEM|{body.model_dump_json()}"
    db.commit()
    return {"ok": True, "incident_id": incident_id}
