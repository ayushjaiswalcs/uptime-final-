from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

from core.deps import get_db, get_current_user
from models.user import User
from models.monitor import Monitor
from models.monitor_log import MonitorLog
from models.sla import SLAPolicy, MonitorSLA, SLODefinition

router = APIRouter(prefix="/sla", tags=["sla"])


class SLAPolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    availability_target: float = 99.9
    response_time_target: int = 200
    error_rate_target: float = 0.1
    window_days: int = 30


class SLAPolicyOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    availability_target: float
    response_time_target: int
    error_rate_target: float
    window_days: int
    created_at: datetime

    class Config:
        from_attributes = True


class SLOCreate(BaseModel):
    name: str
    monitor_id: Optional[int] = None
    metric_type: str  # availability, latency, error_rate
    target_value: float
    window_days: int = 30


class SLOOut(BaseModel):
    id: int
    name: str
    monitor_id: Optional[int]
    metric_type: str
    target_value: float
    window_days: int
    error_budget_minutes: Optional[float]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


def compute_availability(monitor_id: int, window_days: int, db: Session) -> float:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    logs = db.query(MonitorLog).filter(
        MonitorLog.monitor_id == monitor_id,
        MonitorLog.checked_at >= since
    ).all()
    if not logs:
        return 100.0
    up = sum(1 for l in logs if l.status == "up")
    return round((up / len(logs)) * 100, 3)


def compute_avg_latency(monitor_id: int, window_days: int, db: Session) -> float:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    result = db.query(func.avg(MonitorLog.response_time)).filter(
        MonitorLog.monitor_id == monitor_id,
        MonitorLog.checked_at >= since,
        MonitorLog.response_time.isnot(None)
    ).scalar()
    return round(result or 0, 2)


@router.get("/policies", response_model=List[SLAPolicyOut])
def list_policies(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(SLAPolicy).filter(SLAPolicy.user_id == current_user.id).all()


@router.post("/policies", response_model=SLAPolicyOut)
def create_policy(body: SLAPolicyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    policy = SLAPolicy(user_id=current_user.id, **body.model_dump())
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.delete("/policies/{policy_id}")
def delete_policy(policy_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    policy = db.query(SLAPolicy).filter(SLAPolicy.id == policy_id, SLAPolicy.user_id == current_user.id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    db.delete(policy)
    db.commit()
    return {"ok": True}


@router.get("/slos", response_model=List[SLOOut])
def list_slos(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(SLODefinition).filter(SLODefinition.user_id == current_user.id).all()


@router.post("/slos", response_model=SLOOut)
def create_slo(body: SLOCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Compute error budget minutes for availability SLOs
    error_budget = None
    if body.metric_type == "availability":
        total_minutes = body.window_days * 24 * 60
        error_budget = round(total_minutes * (1 - body.target_value / 100), 2)

    slo = SLODefinition(
        user_id=current_user.id,
        error_budget_minutes=error_budget,
        **body.model_dump()
    )
    db.add(slo)
    db.commit()
    db.refresh(slo)
    return slo


@router.delete("/slos/{slo_id}")
def delete_slo(slo_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    slo = db.query(SLODefinition).filter(SLODefinition.id == slo_id, SLODefinition.user_id == current_user.id).first()
    if not slo:
        raise HTTPException(status_code=404, detail="SLO not found")
    db.delete(slo)
    db.commit()
    return {"ok": True}


@router.get("/compliance-report")
def sla_compliance_report(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitors = db.query(Monitor).filter(Monitor.user_id == current_user.id).all()
    report = []
    for m in monitors:
        avail_30 = compute_availability(m.id, 30, db)
        avail_7 = compute_availability(m.id, 7, db)
        avg_latency = compute_avg_latency(m.id, 30, db)
        report.append({
            "monitor_id": m.id,
            "monitor_name": m.monitor_name,
            "url": m.url,
            "availability_30d": avail_30,
            "availability_7d": avail_7,
            "avg_latency_ms": avg_latency,
            "meets_99_9": avail_30 >= 99.9,
            "meets_99_5": avail_30 >= 99.5,
            "meets_99_0": avail_30 >= 99.0,
            "downtime_minutes_30d": round((100 - avail_30) / 100 * 30 * 24 * 60, 1),
        })
    total = len(report)
    compliant = sum(1 for r in report if r["meets_99_9"])
    return {
        "monitors": report,
        "summary": {
            "total_monitors": total,
            "compliant_99_9": compliant,
            "compliance_rate": round(compliant / total * 100, 1) if total else 0,
            "avg_availability": round(sum(r["availability_30d"] for r in report) / total, 3) if total else 0,
        }
    }


@router.get("/error-budgets")
def error_budgets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    slos = db.query(SLODefinition).filter(
        SLODefinition.user_id == current_user.id,
        SLODefinition.is_active == True,
        SLODefinition.metric_type == "availability"
    ).all()
    result = []
    for slo in slos:
        if not slo.monitor_id:
            continue
        current_avail = compute_availability(slo.monitor_id, slo.window_days, db)
        total_minutes = slo.window_days * 24 * 60
        allowed_downtime = total_minutes * (1 - slo.target_value / 100)
        actual_downtime = total_minutes * (1 - current_avail / 100)
        budget_remaining = max(0, allowed_downtime - actual_downtime)
        budget_consumed = min(100, round(actual_downtime / allowed_downtime * 100, 1)) if allowed_downtime > 0 else 0
        result.append({
            "slo_id": slo.id,
            "slo_name": slo.name,
            "monitor_id": slo.monitor_id,
            "target": slo.target_value,
            "current": current_avail,
            "budget_minutes_total": round(allowed_downtime, 1),
            "budget_minutes_remaining": round(budget_remaining, 1),
            "budget_consumed_pct": budget_consumed,
            "status": "ok" if budget_consumed < 80 else "warning" if budget_consumed < 100 else "exhausted",
        })
    return result
