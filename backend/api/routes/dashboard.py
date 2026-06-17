from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime, timedelta, timezone
from core.deps import get_db, get_current_user
from models.user import User
from models.monitor import Monitor
from models.monitor_log import MonitorLog
from models.incident import Incident
from schemas.dashboard import DashboardStats, UptimeDataPoint, ResponseTimeDataPoint
from schemas.incident import IncidentOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitors = db.query(Monitor).filter(Monitor.user_id == current_user.id).all()
    total = len(monitors)
    up = sum(1 for m in monitors if m.current_status == "up")
    down = sum(1 for m in monitors if m.current_status == "down")
    paused = sum(1 for m in monitors if m.is_paused)

    monitor_ids = [m.id for m in monitors]
    avg_rt = 0.0
    if monitor_ids:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        result = (
            db.query(func.avg(MonitorLog.response_time))
            .filter(MonitorLog.monitor_id.in_(monitor_ids), MonitorLog.checked_at >= since, MonitorLog.response_time.isnot(None))
            .scalar()
        )
        avg_rt = round(float(result or 0), 2)

    uptimes = [float(m.uptime_percentage) for m in monitors if m.uptime_percentage]
    overall = f"{(sum(uptimes) / len(uptimes)):.2f}" if uptimes else "100.00"

    warning = sum(1 for m in monitors if not m.is_paused and 95 <= float(m.uptime_percentage or 100) < 99)

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    total_incidents = db.query(Incident).filter(Incident.monitor_id.in_(monitor_ids)).count() if monitor_ids else 0
    incidents_today = db.query(Incident).filter(
        Incident.monitor_id.in_(monitor_ids),
        Incident.outage_start_time >= today_start,
    ).count() if monitor_ids else 0

    return DashboardStats(
        total_monitors=total,
        up_monitors=up,
        down_monitors=down,
        paused_monitors=paused,
        warning_monitors=warning,
        avg_response_time=avg_rt,
        overall_uptime=overall,
        total_incidents=total_incidents,
        incidents_today=incidents_today,
    )


@router.get("/uptime-chart", response_model=List[UptimeDataPoint])
def get_uptime_chart(days: int = 7, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor_ids = [m.id for m in db.query(Monitor).filter(Monitor.user_id == current_user.id).all()]
    result = []
    for i in range(days - 1, -1, -1):
        day = datetime.now(timezone.utc) - timedelta(days=i)
        start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        if monitor_ids:
            total_logs = db.query(MonitorLog).filter(
                MonitorLog.monitor_id.in_(monitor_ids),
                MonitorLog.checked_at >= start,
                MonitorLog.checked_at < end,
            ).count()
            up_logs = db.query(MonitorLog).filter(
                MonitorLog.monitor_id.in_(monitor_ids),
                MonitorLog.checked_at >= start,
                MonitorLog.checked_at < end,
                MonitorLog.is_up == True,
            ).count()
            uptime = (up_logs / total_logs * 100) if total_logs > 0 else 100.0
        else:
            uptime = 100.0
        result.append(UptimeDataPoint(date=start.strftime("%b %d"), uptime=round(uptime, 2)))
    return result


@router.get("/response-time-chart", response_model=List[ResponseTimeDataPoint])
def get_response_time_chart(days: int = 7, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor_ids = [m.id for m in db.query(Monitor).filter(Monitor.user_id == current_user.id).all()]
    result = []
    for i in range(days - 1, -1, -1):
        day = datetime.now(timezone.utc) - timedelta(days=i)
        start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        if monitor_ids:
            avg = db.query(func.avg(MonitorLog.response_time)).filter(
                MonitorLog.monitor_id.in_(monitor_ids),
                MonitorLog.checked_at >= start,
                MonitorLog.checked_at < end,
                MonitorLog.response_time.isnot(None),
            ).scalar()
        else:
            avg = None
        result.append(ResponseTimeDataPoint(date=start.strftime("%b %d"), response_time=round(float(avg or 0), 2)))
    return result


@router.get("/recent-incidents", response_model=List[IncidentOut])
def get_recent_incidents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor_ids = [m.id for m in db.query(Monitor).filter(Monitor.user_id == current_user.id).all()]
    from sqlalchemy import desc
    incidents = (
        db.query(Incident)
        .filter(Incident.monitor_id.in_(monitor_ids))
        .order_by(desc(Incident.outage_start_time))
        .limit(5)
        .all()
    )
    result = []
    for inc in incidents:
        monitor = db.query(Monitor).filter(Monitor.id == inc.monitor_id).first()
        out = IncidentOut.model_validate(inc)
        out.monitor_name = monitor.monitor_name if monitor else "Unknown"
        result.append(out)
    return result
