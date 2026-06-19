"""Escalation Matrix REST API."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional, Dict
from pydantic import BaseModel

from core.deps import get_db, get_current_user
from models.user import User
from models.monitor import Monitor
from models.incident import Incident
from models.escalation import (
    EscalationConfig, EscalationLevel, EscalationChannel, EscalationHistory,
    SEVERITIES, CHANNELS,
)

router = APIRouter(prefix="/escalation", tags=["escalation"])

STATUSES = ("active", "inactive", "draft")

MONITOR_TYPE_LABELS = {
    "http": "URL Monitor", "https": "URL Monitor",
    "tcp": "TCP Monitor", "ssl": "SSL Monitor",
    "ping": "Heartbeat Monitor", "dns": "DNS Monitor",
    "keyword": "Keyword Monitor", "api": "API Monitor",
    "webhook": "Webhook Monitor", "heartbeat": "Heartbeat Monitor",
}


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class ChannelIn(BaseModel):
    channel: str
    enabled: bool = False


class LevelIn(BaseModel):
    level_number: int
    escalation_name: str
    timer_minutes: Optional[int] = None
    notify_target: Optional[str] = None
    is_active: bool = True
    channels: Optional[Dict[str, bool]] = None


class LevelUpdate(BaseModel):
    escalation_name: Optional[str] = None
    timer_minutes: Optional[int] = None
    notify_target: Optional[str] = None
    level_number: Optional[int] = None
    is_active: Optional[bool] = None


class ConfigIn(BaseModel):
    name: str
    severity: str = "NORMAL"
    status: str = "active"
    description: Optional[str] = None
    monitor_id: Optional[int] = None
    is_active: bool = True


class ConfigUpdate(BaseModel):
    name: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    monitor_id: Optional[int] = None
    is_active: Optional[bool] = None


# --------------------------------------------------------------------------- #
# Serialization
# --------------------------------------------------------------------------- #
def _serialize_level(level: EscalationLevel) -> dict:
    channels = {c.channel: c.enabled for c in level.channels}
    return {
        "id": level.id,
        "config_id": level.config_id,
        "level_number": level.level_number,
        "escalation_name": level.escalation_name,
        "timer_minutes": level.timer_minutes,
        "notify_target": level.notify_target,
        "is_active": level.is_active,
        "channels": {ch: channels.get(ch, False) for ch in CHANNELS},
    }


def _serialize_config(
    config: EscalationConfig,
    created_by_name: str = "Unknown",
    total_notifications: int = 0,
    total_monitors: int = 0,
) -> dict:
    raw_status = getattr(config, "status", None) or ("active" if config.is_active else "inactive")
    return {
        "id": config.id,
        "name": config.name,
        "status": raw_status,
        "severity": config.severity,
        "description": config.description,
        "monitor_id": config.monitor_id,
        "is_active": config.is_active,
        "is_default": config.is_default,
        "created_at": config.created_at,
        "updated_at": config.updated_at,
        "created_by": created_by_name,
        "total_levels": len(config.levels),
        "total_notifications": total_notifications,
        "total_monitors": total_monitors,
        "levels": [_serialize_level(l) for l in config.levels],
    }


def _owned_config(db: Session, config_id: int, user: User) -> EscalationConfig:
    config = db.query(EscalationConfig).options(
        joinedload(EscalationConfig.levels).joinedload(EscalationLevel.channels)
    ).filter(EscalationConfig.id == config_id, EscalationConfig.user_id == user.id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Escalation config not found")
    return config


def _owned_level(db: Session, level_id: int, user: User) -> EscalationLevel:
    level = db.query(EscalationLevel).options(joinedload(EscalationLevel.channels)).join(
        EscalationConfig, EscalationLevel.config_id == EscalationConfig.id
    ).filter(EscalationLevel.id == level_id, EscalationConfig.user_id == user.id).first()
    if not level:
        raise HTTPException(status_code=404, detail="Escalation level not found")
    return level


def _apply_channels(db: Session, level: EscalationLevel, channels: Dict[str, bool]) -> None:
    existing = {c.channel: c for c in level.channels}
    for ch, enabled in channels.items():
        if ch not in CHANNELS:
            continue
        if ch in existing:
            existing[ch].enabled = bool(enabled)
        else:
            db.add(EscalationChannel(level_id=level.id, channel=ch, enabled=bool(enabled)))


def _serialize_monitor_brief(m: Monitor) -> dict:
    return {
        "id": m.id,
        "monitor_name": m.monitor_name,
        "monitor_type": m.monitor_type,
        "monitor_type_label": MONITOR_TYPE_LABELS.get(m.monitor_type, m.monitor_type),
        "target_url": m.target_url,
        "current_status": m.current_status,
        "is_paused": m.is_paused,
        "last_checked_at": m.last_checked_at,
        "escalation_config_id": m.escalation_config_id,
    }


def _serialize_history_row(h: EscalationHistory, mon: Optional[Monitor], inc: Optional[Incident]) -> dict:
    return {
        "id": h.id,
        "incident_id": h.incident_id,
        "monitor_id": h.monitor_id,
        "monitor_name": mon.monitor_name if mon else None,
        "monitor_type": mon.monitor_type if mon else None,
        "event_type": h.event_type,
        "severity": h.severity,
        "level_number": h.level_number,
        "channel": h.channel,
        "target": h.target,
        "status": h.status,
        "message": h.message,
        "created_at": h.created_at,
        "recovery_time": inc.recovery_time if inc else None,
        "config_id": h.config_id,
    }


# --------------------------------------------------------------------------- #
# Config CRUD
# --------------------------------------------------------------------------- #
@router.get("/configs")
def list_configs(
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(EscalationConfig).options(
        joinedload(EscalationConfig.levels).joinedload(EscalationLevel.channels)
    ).filter(EscalationConfig.user_id == current_user.id)
    if severity:
        q = q.filter(EscalationConfig.severity == severity.upper())
    if status:
        q = q.filter(EscalationConfig.status == status.lower())
    configs = q.order_by(EscalationConfig.severity, EscalationConfig.id).all()

    # Batch-count monitors per config (one query instead of N)
    config_ids = [c.id for c in configs]
    monitor_counts: dict[int, int] = {}
    if config_ids:
        rows = db.query(Monitor.escalation_config_id, func.count(Monitor.id)).filter(
            Monitor.escalation_config_id.in_(config_ids)
        ).group_by(Monitor.escalation_config_id).all()
        monitor_counts = {cid: cnt for cid, cnt in rows}

    return [_serialize_config(c, current_user.name, total_monitors=monitor_counts.get(c.id, 0)) for c in configs]


@router.get("/configs/{config_id}")
def get_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = _owned_config(db, config_id, current_user)
    notif_count = db.query(func.count(EscalationHistory.id)).filter(
        EscalationHistory.config_id == config_id,
        EscalationHistory.event_type == "notification_sent",
    ).scalar() or 0
    mon_count = db.query(func.count(Monitor.id)).filter(
        Monitor.escalation_config_id == config_id
    ).scalar() or 0
    return _serialize_config(config, current_user.name, notif_count, mon_count)


@router.get("/configs/{config_id}/monitors")
def list_config_monitors(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_config(db, config_id, current_user)
    monitors = db.query(Monitor).filter(
        Monitor.user_id == current_user.id,
        Monitor.escalation_config_id == config_id,
    ).order_by(Monitor.monitor_name).all()
    return [_serialize_monitor_brief(m) for m in monitors]


@router.post("/configs/{config_id}/monitors/{monitor_id}")
def attach_monitor(
    config_id: int,
    monitor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_config(db, config_id, current_user)
    monitor = db.query(Monitor).filter(
        Monitor.id == monitor_id,
        Monitor.user_id == current_user.id,
    ).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    monitor.escalation_config_id = config_id
    db.commit()
    return {"ok": True, "monitor_id": monitor_id, "config_id": config_id}


@router.delete("/configs/{config_id}/monitors/{monitor_id}")
def detach_monitor(
    config_id: int,
    monitor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_config(db, config_id, current_user)
    monitor = db.query(Monitor).filter(
        Monitor.id == monitor_id,
        Monitor.user_id == current_user.id,
        Monitor.escalation_config_id == config_id,
    ).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not attached to this config")
    monitor.escalation_config_id = None
    db.commit()
    return {"ok": True}


@router.post("/configs")
def create_config(body: ConfigIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if body.severity.upper() not in SEVERITIES:
        raise HTTPException(status_code=400, detail=f"severity must be one of {SEVERITIES}")
    if body.status.lower() not in STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {STATUSES}")
    config = EscalationConfig(
        user_id=current_user.id,
        name=body.name,
        severity=body.severity.upper(),
        status=body.status.lower(),
        description=body.description,
        monitor_id=body.monitor_id,
        is_active=body.status.lower() == "active",
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return _serialize_config(config, current_user.name)


@router.patch("/configs/{config_id}")
def update_config(config_id: int, body: ConfigUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    config = _owned_config(db, config_id, current_user)
    data = body.model_dump(exclude_unset=True)
    if "severity" in data and data["severity"]:
        if data["severity"].upper() not in SEVERITIES:
            raise HTTPException(status_code=400, detail=f"severity must be one of {SEVERITIES}")
        data["severity"] = data["severity"].upper()
    if "status" in data and data["status"]:
        if data["status"].lower() not in STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {STATUSES}")
        data["status"] = data["status"].lower()
        data["is_active"] = data["status"] == "active"
    for k, v in data.items():
        setattr(config, k, v)
    db.commit()
    db.refresh(config)
    return _serialize_config(_owned_config(db, config_id, current_user), current_user.name)


@router.post("/configs/{config_id}/toggle")
def toggle_config(config_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    config = _owned_config(db, config_id, current_user)
    config.is_active = not config.is_active
    config.status = "active" if config.is_active else "inactive"
    db.commit()
    return {"id": config.id, "is_active": config.is_active, "status": config.status}


@router.post("/configs/{config_id}/clone")
def clone_config(config_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    src = _owned_config(db, config_id, current_user)
    clone = EscalationConfig(
        user_id=current_user.id,
        name=f"{src.name} (copy)",
        severity=src.severity,
        status="draft",
        description=src.description,
        monitor_id=src.monitor_id,
        is_active=False,
        is_default=False,
    )
    db.add(clone)
    db.flush()
    for lvl in src.levels:
        new_level = EscalationLevel(
            config_id=clone.id,
            level_number=lvl.level_number,
            escalation_name=lvl.escalation_name,
            timer_minutes=lvl.timer_minutes,
            notify_target=lvl.notify_target,
            is_active=lvl.is_active,
        )
        db.add(new_level)
        db.flush()
        for ch in lvl.channels:
            db.add(EscalationChannel(level_id=new_level.id, channel=ch.channel, enabled=ch.enabled))
    db.commit()
    return _serialize_config(_owned_config(db, clone.id, current_user), current_user.name)


@router.delete("/configs/{config_id}")
def delete_config(config_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    config = _owned_config(db, config_id, current_user)
    db.delete(config)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Level CRUD
# --------------------------------------------------------------------------- #
@router.post("/configs/{config_id}/levels")
def add_level(config_id: int, body: LevelIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    config = _owned_config(db, config_id, current_user)
    if any(l.level_number == body.level_number for l in config.levels):
        raise HTTPException(status_code=400, detail=f"Level {body.level_number} already exists")
    level = EscalationLevel(
        config_id=config.id,
        level_number=body.level_number,
        escalation_name=body.escalation_name,
        timer_minutes=body.timer_minutes,
        notify_target=body.notify_target,
        is_active=body.is_active,
    )
    db.add(level)
    db.flush()
    for ch in CHANNELS:
        db.add(EscalationChannel(level_id=level.id, channel=ch, enabled=(ch == "web")))
    db.flush()
    if body.channels:
        db.refresh(level)
        _apply_channels(db, level, body.channels)
    db.commit()
    return _serialize_level(_owned_level(db, level.id, current_user))


@router.patch("/levels/{level_id}")
def update_level(level_id: int, body: LevelUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    level = _owned_level(db, level_id, current_user)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(level, k, v)
    db.commit()
    return _serialize_level(_owned_level(db, level.id, current_user))


@router.delete("/levels/{level_id}")
def delete_level(level_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    level = _owned_level(db, level_id, current_user)
    db.delete(level)
    db.commit()
    return {"ok": True}


@router.put("/levels/{level_id}/channels")
def set_channels(level_id: int, channels: Dict[str, bool], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    level = _owned_level(db, level_id, current_user)
    _apply_channels(db, level, channels)
    db.commit()
    return _serialize_level(_owned_level(db, level.id, current_user))


@router.patch("/channels/{channel_id}")
def toggle_channel(channel_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    channel = db.query(EscalationChannel).join(
        EscalationLevel, EscalationChannel.level_id == EscalationLevel.id
    ).join(
        EscalationConfig, EscalationLevel.config_id == EscalationConfig.id
    ).filter(EscalationChannel.id == channel_id, EscalationConfig.user_id == current_user.id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    channel.enabled = not channel.enabled
    db.commit()
    return {"id": channel.id, "channel": channel.channel, "enabled": channel.enabled}


# --------------------------------------------------------------------------- #
# History / timeline / notification logs
# --------------------------------------------------------------------------- #
def _base_history_query(db: Session, user_id: int):
    return (
        db.query(EscalationHistory, Monitor, Incident)
        .join(Monitor, EscalationHistory.monitor_id == Monitor.id, isouter=True)
        .join(Incident, EscalationHistory.incident_id == Incident.id, isouter=True)
        .filter(EscalationHistory.user_id == user_id)
    )


def _serialize_history(rows) -> list:
    return [_serialize_history_row(h, mon, inc) for h, mon, inc in rows]


@router.get("/history")
def list_history(
    incident_id: Optional[int] = Query(None),
    config_id: Optional[int] = Query(None),
    event_type: Optional[str] = Query(None),
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = _base_history_query(db, current_user.id)
    if incident_id:
        q = q.filter(EscalationHistory.incident_id == incident_id)
    if config_id:
        q = q.filter(EscalationHistory.config_id == config_id)
    if event_type:
        q = q.filter(EscalationHistory.event_type == event_type)
    rows = q.order_by(EscalationHistory.created_at.desc()).limit(limit).all()
    return _serialize_history(rows)


@router.get("/notifications")
def notification_logs(
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = _base_history_query(db, current_user.id).filter(
        EscalationHistory.event_type == "notification_sent",
    ).order_by(EscalationHistory.created_at.desc()).limit(limit).all()
    return _serialize_history(rows)


@router.get("/incidents/{incident_id}/timeline")
def incident_timeline(incident_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = _base_history_query(db, current_user.id).filter(
        EscalationHistory.incident_id == incident_id,
    ).order_by(EscalationHistory.created_at.asc()).all()
    return _serialize_history(rows)


# --------------------------------------------------------------------------- #
# Active escalations + dashboard stats
# --------------------------------------------------------------------------- #
@router.get("/active")
def active_escalations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Incident).options(joinedload(Incident.monitor)).join(
        Monitor, Incident.monitor_id == Monitor.id
    ).filter(
        Monitor.user_id == current_user.id,
        Incident.escalation_active.is_(True),
        Incident.incident_status == "ongoing",
    ).order_by(Incident.outage_start_time.desc()).all()
    return [{
        "incident_id": i.id,
        "monitor_id": i.monitor_id,
        "monitor_name": i.monitor.monitor_name if i.monitor else None,
        "severity": i.severity,
        "escalation_level": i.escalation_level,
        "next_escalation_at": i.next_escalation_at,
        "outage_start_time": i.outage_start_time,
        "error_message": i.error_message,
    } for i in rows]


@router.get("/stats")
def dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    mq = db.query(Monitor).filter(Monitor.user_id == current_user.id)
    total_monitors = mq.count()
    active_monitors = mq.filter(Monitor.is_paused.is_(False)).count()
    down_monitors = mq.filter(Monitor.current_status == "down").count()

    iq = db.query(Incident).join(Monitor, Incident.monitor_id == Monitor.id).filter(
        Monitor.user_id == current_user.id
    )
    open_incidents = iq.filter(Incident.incident_status == "ongoing").count()
    critical_incidents = iq.filter(
        Incident.incident_status == "ongoing", Incident.severity == "critical"
    ).count()
    resolved_incidents = iq.filter(Incident.incident_status == "resolved").count()
    active_escalations = iq.filter(
        Incident.escalation_active.is_(True), Incident.incident_status == "ongoing"
    ).count()

    return {
        "total_monitors": total_monitors,
        "active_monitors": active_monitors,
        "down_monitors": down_monitors,
        "open_incidents": open_incidents,
        "critical_incidents": critical_incidents,
        "active_escalations": active_escalations,
        "resolved_incidents": resolved_incidents,
    }
