import logging

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from datetime import datetime, timedelta, timezone
from core.audit import log_action
from core.deps import get_db, get_current_user
from core.monitoring import check_monitor

logger = logging.getLogger("uptime.monitors")
from models.user import User
from models.monitor import Monitor
from models.monitor_log import MonitorLog
from schemas.monitor import MonitorCreate, MonitorUpdate, MonitorOut, MonitorLogOut
from models.incident import Incident

router = APIRouter(prefix="/monitors", tags=["monitors"])


@router.get("", response_model=List[MonitorOut])
def list_monitors(
    all: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Admin/owner can pass ?all=true to see every monitor across all users.
    if all and current_user.role in ("admin", "owner"):
        monitors = db.query(Monitor).order_by(desc(Monitor.created_at)).all()
        # Attach owner name so the frontend can show it.
        user_map = {u.id: u.name for u in db.query(User).filter(
            User.id.in_({m.user_id for m in monitors})
        ).all()}
        for m in monitors:
            m._owner_name = user_map.get(m.user_id, "Unknown")
        return monitors
    return db.query(Monitor).filter(Monitor.user_id == current_user.id).order_by(desc(Monitor.created_at)).all()


@router.post("", response_model=MonitorOut, status_code=201)
def create_monitor(
    data: MonitorCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    monitor = Monitor(user_id=current_user.id, **data.model_dump())
    db.add(monitor)
    db.flush()
    log_action(
        db,
        user_id=current_user.id,
        action="monitor.create",
        resource_type="monitor",
        resource_id=monitor.id,
        details={"name": monitor.monitor_name, "type": monitor.monitor_type, "url": monitor.target_url},
    )
    db.commit()
    db.refresh(monitor)
    logger.info("Monitor created id=%s name=%r type=%s by user=%s", monitor.id, monitor.monitor_name, monitor.monitor_type, current_user.id)
    # Run the first check immediately (after the response is sent) so the
    # monitor shows a real status and a first monitor_logs row right away,
    # instead of waiting up to one full interval for the scheduler.
    background_tasks.add_task(check_monitor, monitor.id)
    return monitor


@router.get("/{monitor_id}", response_model=MonitorOut)
def get_monitor(monitor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role in ("admin", "owner"):
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id).first()
    else:
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return monitor


@router.put("/{monitor_id}", response_model=MonitorOut)
def update_monitor(monitor_id: int, data: MonitorUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(monitor, field, value)
    db.commit()
    db.refresh(monitor)
    return monitor


@router.delete("/{monitor_id}", status_code=204)
def delete_monitor(monitor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    log_action(
        db,
        user_id=current_user.id,
        action="monitor.delete",
        resource_type="monitor",
        resource_id=monitor_id,
        details={"name": monitor.monitor_name, "url": monitor.target_url},
    )
    db.delete(monitor)
    db.commit()


@router.post("/{monitor_id}/pause")
def pause_monitor(monitor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    monitor.is_paused = not monitor.is_paused
    monitor.current_status = "paused" if monitor.is_paused else "pending"
    db.commit()
    return {"is_paused": monitor.is_paused}


@router.get("/{monitor_id}/metrics")
def get_monitor_metrics(
    monitor_id: int,
    range: str = "1d",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in ("admin", "owner"):
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id).first()
    else:
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")

    if range == "7d":
        hours_back, bucket_hours, fmt = 168, 6, "%b %d %H:%M"
    elif range == "30d":
        hours_back, bucket_hours, fmt = 720, 24, "%b %d"
    else:
        hours_back, bucket_hours, fmt = 24, 1, "%H:%M"

    since = datetime.now(timezone.utc) - timedelta(hours=hours_back)
    logs = (
        db.query(MonitorLog)
        .filter(MonitorLog.monitor_id == monitor_id, MonitorLog.checked_at >= since)
        .order_by(MonitorLog.checked_at)
        .all()
    )

    buckets: dict = {}
    for log in logs:
        ts = log.checked_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        slot = ts.replace(hour=(ts.hour // bucket_hours) * bucket_hours, minute=0, second=0, microsecond=0)
        b = buckets.setdefault(slot, {"up": 0, "total": 0, "rt_sum": 0.0, "rt_count": 0})
        b["total"] += 1
        if log.is_up:
            b["up"] += 1
        if log.response_time is not None:
            b["rt_sum"] += log.response_time
            b["rt_count"] += 1

    chart_buckets = []
    for ts, b in sorted(buckets.items()):
        chart_buckets.append({
            "timestamp": ts.isoformat(),
            "label": ts.strftime(fmt),
            "uptime": round((b["up"] / b["total"] * 100) if b["total"] else 100.0, 2),
            "response_time": round(b["rt_sum"] / b["rt_count"] if b["rt_count"] else 0.0, 2),
            "up_count": b["up"],
            "total_count": b["total"],
        })

    total_checks = sum(b["total_count"] for b in chart_buckets)
    up_checks = sum(b["up_count"] for b in chart_buckets)
    total_rt = sum(b["response_time"] * b["total_count"] for b in chart_buckets)
    avg_rt = round(total_rt / total_checks, 2) if total_checks else 0.0

    incidents = (
        db.query(Incident)
        .filter(Incident.monitor_id == monitor_id, Incident.outage_start_time >= since)
        .order_by(desc(Incident.outage_start_time))
        .all()
    )
    incident_list = [
        {
            "id": inc.id,
            "started_at": inc.outage_start_time.isoformat(),
            "resolved_at": inc.recovery_time.isoformat() if inc.recovery_time else None,
            "status": inc.incident_status,
            "error": inc.error_message,
            "duration_mins": round(
                ((inc.recovery_time or datetime.now(timezone.utc)) - inc.outage_start_time).total_seconds() / 60
            ),
        }
        for inc in incidents
    ]

    return {
        "range": range,
        "total_checks": total_checks,
        "up_checks": up_checks,
        "down_checks": total_checks - up_checks,
        "avg_response_time": avg_rt,
        "incident_count": len(incidents),
        "buckets": chart_buckets,
        "incidents": incident_list,
    }


@router.get("/{monitor_id}/ping-stats")
def get_ping_stats(
    monitor_id: int,
    hours: int = 24,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ping-specific time-series endpoint.

    Returns per-check packet_loss%, min/avg/max latency, last success,
    last failure, and an error-reason breakdown — everything the ping
    detail panels need.
    """
    if current_user.role in ("admin", "owner"):
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id).first()
    else:
        monitor = db.query(Monitor).filter(
            Monitor.id == monitor_id, Monitor.user_id == current_user.id
        ).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    if monitor.monitor_type != "ping":
        raise HTTPException(status_code=400, detail="ping-stats only available for Ping monitors")

    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    logs = (
        db.query(MonitorLog)
        .filter(MonitorLog.monitor_id == monitor_id, MonitorLog.checked_at >= since)
        .order_by(MonitorLog.checked_at)
        .all()
    )

    # ── Build per-check series ──────────────────────────────────────────────
    series = []
    for log in logs:
        ts = log.checked_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        # Derive packet_loss for legacy rows that pre-date the column
        loss = log.packet_loss
        if loss is None:
            loss = 0.0 if log.is_up else 100.0
        series.append({
            "timestamp": ts.isoformat(),
            "is_up": log.is_up,
            "avg_ms": log.response_time,
            "min_ms": log.ping_min_ms,
            "max_ms": log.ping_max_ms,
            "packet_loss": loss,
            "error": log.error_message,
        })

    # ── Last success / failure ──────────────────────────────────────────────
    last_success = next((s for s in reversed(series) if s["is_up"]), None)
    last_failure = next((s for s in reversed(series) if not s["is_up"]), None)

    # ── Aggregate stats ─────────────────────────────────────────────────────
    avg_latencies = [s["avg_ms"] for s in series if s["avg_ms"] is not None]
    min_latencies = [s["min_ms"] for s in series if s["min_ms"] is not None]
    max_latencies = [s["max_ms"] for s in series if s["max_ms"] is not None]
    losses = [s["packet_loss"] for s in series if s["packet_loss"] is not None]

    def _avg(lst):
        return round(sum(lst) / len(lst), 2) if lst else None

    # ── Error reason breakdown (top 5) ─────────────────────────────────────
    error_counts: dict = {}
    for s in series:
        if not s["is_up"] and s["error"]:
            # Normalise: first 80 chars, strip trailing period/whitespace
            key = s["error"].rstrip(". ")[:80]
            error_counts[key] = error_counts.get(key, 0) + 1

    error_breakdown = [
        {"reason": k, "count": v}
        for k, v in sorted(error_counts.items(), key=lambda x: -x[1])[:5]
    ]

    return {
        "hours": hours,
        "total_checks": len(series),
        "up_checks": sum(1 for s in series if s["is_up"]),
        "down_checks": sum(1 for s in series if not s["is_up"]),
        "avg_packet_loss": _avg(losses),
        "overall_avg_ms": _avg(avg_latencies),
        "overall_min_ms": round(min(min_latencies), 2) if min_latencies else None,
        "overall_max_ms": round(max(max_latencies), 2) if max_latencies else None,
        "last_success": last_success,
        "last_failure": last_failure,
        "error_breakdown": error_breakdown,
        "series": series,
    }


@router.get("/{monitor_id}/logs", response_model=List[MonitorLogOut])
def get_monitor_logs(
    monitor_id: int,
    hours: int = 24,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in ("admin", "owner"):
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id).first()
    else:
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    logs = (
        db.query(MonitorLog)
        .filter(MonitorLog.monitor_id == monitor_id, MonitorLog.checked_at >= since)
        .order_by(desc(MonitorLog.checked_at))
        .limit(500)
        .all()
    )
    return logs
