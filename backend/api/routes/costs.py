from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

from core.deps import get_db, get_current_user
from models.user import User
from models.cost import CloudCostEntry, BudgetAlert, ResourceInventory

router = APIRouter(prefix="/costs", tags=["costs"])


class CostEntryCreate(BaseModel):
    provider: str
    service: str
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None
    region: Optional[str] = None
    amount: float
    currency: str = "USD"
    period_start: datetime
    period_end: datetime
    tags: dict = {}


class BudgetAlertCreate(BaseModel):
    name: str
    provider: Optional[str] = None
    service: Optional[str] = None
    budget_amount: float
    alert_threshold: float = 80.0
    period: str = "monthly"


class ResourceCreate(BaseModel):
    provider: str
    resource_type: str
    resource_id: str
    resource_name: Optional[str] = None
    region: Optional[str] = None
    status: str = "running"
    owner: Optional[str] = None
    tags: dict = {}
    monthly_cost: Optional[float] = None


@router.get("/summary")
def cost_summary(
    window_days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    entries = db.query(CloudCostEntry).filter(
        CloudCostEntry.user_id == current_user.id,
        CloudCostEntry.period_start >= since
    ).all()

    total = sum(e.amount for e in entries)
    by_provider: dict = {}
    by_service: dict = {}
    for e in entries:
        by_provider[e.provider] = by_provider.get(e.provider, 0) + e.amount
        by_service[e.service] = by_service.get(e.service, 0) + e.amount

    # Month-over-month trend
    prev_start = datetime.now(timezone.utc) - timedelta(days=window_days * 2)
    prev_end = since
    prev_entries = db.query(CloudCostEntry).filter(
        CloudCostEntry.user_id == current_user.id,
        CloudCostEntry.period_start >= prev_start,
        CloudCostEntry.period_start < prev_end
    ).all()
    prev_total = sum(e.amount for e in prev_entries)
    change_pct = round((total - prev_total) / prev_total * 100, 1) if prev_total else 0

    # Top resources
    resource_costs: dict = {}
    for e in entries:
        key = e.resource_name or e.resource_id or e.service
        resource_costs[key] = resource_costs.get(key, 0) + e.amount
    top_resources = sorted(resource_costs.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "total_cost": round(total, 2),
        "prev_period_cost": round(prev_total, 2),
        "change_pct": change_pct,
        "by_provider": {k: round(v, 2) for k, v in by_provider.items()},
        "by_service": {k: round(v, 2) for k, v in sorted(by_service.items(), key=lambda x: x[1], reverse=True)[:10]},
        "top_resources": [{"name": name, "cost": round(cost, 2)} for name, cost in top_resources],
        "window_days": window_days,
    }


@router.get("/entries")
def list_entries(
    provider: Optional[str] = None,
    window_days: int = 30,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    q = db.query(CloudCostEntry).filter(
        CloudCostEntry.user_id == current_user.id,
        CloudCostEntry.period_start >= since
    )
    if provider:
        q = q.filter(CloudCostEntry.provider == provider)
    return q.order_by(desc(CloudCostEntry.period_start)).limit(limit).all()


@router.post("/entries")
def create_entry(body: CostEntryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    entry = CloudCostEntry(user_id=current_user.id, **body.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/trends")
def cost_trends(
    window_days: int = 90,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    rows = db.query(
        func.date_trunc('day', CloudCostEntry.period_start).label("day"),
        func.sum(CloudCostEntry.amount).label("total"),
        CloudCostEntry.provider
    ).filter(
        CloudCostEntry.user_id == current_user.id,
        CloudCostEntry.period_start >= since
    ).group_by("day", CloudCostEntry.provider).order_by("day").all()

    return [
        {
            "day": r.day.isoformat() if r.day else None,
            "total": round(float(r.total or 0), 2),
            "provider": r.provider,
        }
        for r in rows
    ]


@router.get("/budget-alerts")
def list_budget_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alerts = db.query(BudgetAlert).filter(BudgetAlert.user_id == current_user.id).all()
    # Compute current spend for each alert
    result = []
    since = datetime.now(timezone.utc) - timedelta(days=30)
    for alert in alerts:
        q = db.query(func.sum(CloudCostEntry.amount)).filter(
            CloudCostEntry.user_id == current_user.id,
            CloudCostEntry.period_start >= since
        )
        if alert.provider:
            q = q.filter(CloudCostEntry.provider == alert.provider)
        if alert.service:
            q = q.filter(CloudCostEntry.service == alert.service)
        current_spend = float(q.scalar() or 0)
        pct_used = round(current_spend / alert.budget_amount * 100, 1) if alert.budget_amount else 0
        result.append({
            "id": alert.id,
            "name": alert.name,
            "provider": alert.provider,
            "service": alert.service,
            "budget_amount": alert.budget_amount,
            "alert_threshold": alert.alert_threshold,
            "period": alert.period,
            "is_active": alert.is_active,
            "current_spend": round(current_spend, 2),
            "pct_used": pct_used,
            "status": "ok" if pct_used < alert.alert_threshold else "warning" if pct_used < 100 else "exceeded",
            "last_triggered": alert.last_triggered,
        })
    return result


@router.post("/budget-alerts")
def create_budget_alert(body: BudgetAlertCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = BudgetAlert(user_id=current_user.id, **body.model_dump())
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@router.delete("/budget-alerts/{alert_id}")
def delete_budget_alert(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = db.query(BudgetAlert).filter(BudgetAlert.id == alert_id, BudgetAlert.user_id == current_user.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(alert)
    db.commit()
    return {"ok": True}


@router.get("/inventory")
def list_inventory(
    provider: Optional[str] = None,
    resource_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(ResourceInventory).filter(ResourceInventory.user_id == current_user.id)
    if provider:
        q = q.filter(ResourceInventory.provider == provider)
    if resource_type:
        q = q.filter(ResourceInventory.resource_type == resource_type)
    return q.order_by(desc(ResourceInventory.last_seen)).all()


@router.post("/inventory")
def add_resource(body: ResourceCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    resource = ResourceInventory(user_id=current_user.id, **body.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


@router.delete("/inventory/{resource_id}")
def delete_resource(resource_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = db.query(ResourceInventory).filter(ResourceInventory.id == resource_id, ResourceInventory.user_id == current_user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(r)
    db.commit()
    return {"ok": True}
