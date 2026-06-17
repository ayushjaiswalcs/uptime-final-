from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import random

from core.deps import get_db, get_current_user
from models.user import User
from models.monitor import Monitor
from models.apm import APMTransaction, APMError, WebVital

router = APIRouter(prefix="/apm", tags=["apm"])


class TransactionCreate(BaseModel):
    monitor_id: int
    transaction_name: str
    duration_ms: float
    status_code: Optional[int] = None
    is_error: bool = False
    error_message: Optional[str] = None
    trace_id: Optional[str] = None


class WebVitalCreate(BaseModel):
    monitor_id: int
    lcp: Optional[float] = None
    fid: Optional[float] = None
    cls: Optional[float] = None
    ttfb: Optional[float] = None
    fcp: Optional[float] = None
    page_url: Optional[str] = None
    country: Optional[str] = None
    browser: Optional[str] = None
    device_type: Optional[str] = None


@router.get("/overview")
def apm_overview(
    window_hours: int = 24,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    since = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    monitor_ids = [m.id for m in db.query(Monitor).filter(Monitor.user_id == current_user.id).all()]

    transactions = db.query(APMTransaction).filter(
        APMTransaction.user_id == current_user.id,
        APMTransaction.created_at >= since
    ).all()

    errors = db.query(APMError).filter(
        APMError.user_id == current_user.id,
        APMError.is_resolved == False
    ).all()

    total_tx = len(transactions)
    error_tx = sum(1 for t in transactions if t.is_error)
    avg_duration = sum(t.duration_ms for t in transactions) / total_tx if total_tx else 0
    p95_duration = 0
    if transactions:
        sorted_durations = sorted(t.duration_ms for t in transactions)
        p95_idx = int(len(sorted_durations) * 0.95)
        p95_duration = sorted_durations[min(p95_idx, len(sorted_durations) - 1)]

    slow_transactions = sorted(transactions, key=lambda t: t.duration_ms, reverse=True)[:10]

    return {
        "total_transactions": total_tx,
        "error_count": error_tx,
        "error_rate": round(error_tx / total_tx * 100, 2) if total_tx else 0,
        "avg_duration_ms": round(avg_duration, 2),
        "p95_duration_ms": round(p95_duration, 2),
        "active_errors": len(errors),
        "slow_transactions": [
            {
                "id": t.id,
                "name": t.transaction_name,
                "duration_ms": t.duration_ms,
                "status_code": t.status_code,
                "is_error": t.is_error,
                "created_at": t.created_at,
            }
            for t in slow_transactions
        ],
        "window_hours": window_hours,
    }


@router.get("/transactions")
def list_transactions(
    monitor_id: Optional[int] = None,
    window_hours: int = 24,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    since = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    q = db.query(APMTransaction).filter(
        APMTransaction.user_id == current_user.id,
        APMTransaction.created_at >= since
    )
    if monitor_id:
        q = q.filter(APMTransaction.monitor_id == monitor_id)
    txs = q.order_by(desc(APMTransaction.created_at)).limit(limit).all()
    return [
        {
            "id": t.id,
            "monitor_id": t.monitor_id,
            "name": t.transaction_name,
            "duration_ms": t.duration_ms,
            "status_code": t.status_code,
            "is_error": t.is_error,
            "error_message": t.error_message,
            "trace_id": t.trace_id,
            "created_at": t.created_at,
        }
        for t in txs
    ]


@router.post("/transactions")
def ingest_transaction(body: TransactionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tx = APMTransaction(user_id=current_user.id, **body.model_dump())
    db.add(tx)
    db.commit()
    return {"id": tx.id}


@router.get("/errors")
def list_errors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    errors = db.query(APMError).filter(APMError.user_id == current_user.id).order_by(desc(APMError.last_seen)).all()
    return [
        {
            "id": e.id,
            "monitor_id": e.monitor_id,
            "error_type": e.error_type,
            "error_message": e.error_message,
            "count": e.count,
            "first_seen": e.first_seen,
            "last_seen": e.last_seen,
            "is_resolved": e.is_resolved,
        }
        for e in errors
    ]


@router.post("/errors/{error_id}/resolve")
def resolve_error(error_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    err = db.query(APMError).filter(APMError.id == error_id, APMError.user_id == current_user.id).first()
    if not err:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    err.is_resolved = True
    db.commit()
    return {"ok": True}


@router.get("/web-vitals")
def web_vitals_summary(
    monitor_id: Optional[int] = None,
    window_hours: int = 24,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    since = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    q = db.query(WebVital).filter(
        WebVital.user_id == current_user.id,
        WebVital.created_at >= since
    )
    if monitor_id:
        q = q.filter(WebVital.monitor_id == monitor_id)
    vitals = q.all()

    def avg(vals):
        filtered = [v for v in vals if v is not None]
        return round(sum(filtered) / len(filtered), 2) if filtered else None

    return {
        "count": len(vitals),
        "avg_lcp": avg([v.lcp for v in vitals]),
        "avg_fid": avg([v.fid for v in vitals]),
        "avg_cls": avg([v.cls for v in vitals]),
        "avg_ttfb": avg([v.ttfb for v in vitals]),
        "avg_fcp": avg([v.fcp for v in vitals]),
        "by_device": _group_by(vitals, "device_type"),
        "by_browser": _group_by(vitals, "browser"),
        "by_country": _group_by(vitals, "country"),
    }


def _group_by(vitals, field: str):
    groups: dict = {}
    for v in vitals:
        key = getattr(v, field) or "Unknown"
        groups[key] = groups.get(key, 0) + 1
    return groups


@router.post("/web-vitals")
def ingest_web_vital(body: WebVitalCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wv = WebVital(user_id=current_user.id, **body.model_dump())
    db.add(wv)
    db.commit()
    return {"id": wv.id}


@router.get("/performance-trends")
def performance_trends(
    window_days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Hourly aggregated avg latency for trend charts."""
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    rows = db.query(
        func.date_trunc('hour', APMTransaction.created_at).label("hour"),
        func.avg(APMTransaction.duration_ms).label("avg_ms"),
        func.count().label("count"),
        func.sum(APMTransaction.is_error.cast(db.bind.dialect.name == 'postgresql' and 'integer' or 'integer')).label("errors")
    ).filter(
        APMTransaction.user_id == current_user.id,
        APMTransaction.created_at >= since
    ).group_by("hour").order_by("hour").all()

    return [
        {
            "hour": r.hour.isoformat() if r.hour else None,
            "avg_ms": round(float(r.avg_ms or 0), 2),
            "count": r.count,
        }
        for r in rows
    ]
