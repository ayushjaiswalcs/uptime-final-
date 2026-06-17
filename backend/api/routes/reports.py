"""
Reports API — JSON data + file export endpoints.

All routes require authentication.  org_id is optional; if omitted,
reports are scoped to the authenticated user's own monitors.
"""
import csv
import io
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.audit import log_action
from core.deps import get_current_user, get_db
from core.excel_generator import ExcelGenerator
from core.pdf_generator import PDFGenerator
from models.audit_log import AuditLog
from models.incident import Incident
from models.monitor import Monitor
from models.monitor_log import MonitorLog
from models.organization import Organization, TeamMember
from models.user import User

router = APIRouter(prefix="/reports", tags=["reports"])

_pdf_gen = PDFGenerator()
_xls_gen = ExcelGenerator()


# ── Internal helpers ───────────────────────────────────────────────────────────

def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _get_org_or_403(org_id: int, user_id: int, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    is_member = (
        db.query(TeamMember)
        .filter(TeamMember.org_id == org_id, TeamMember.user_id == user_id)
        .first()
    )
    if not is_member and org.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    return org


def _org_member_user_ids(org_id: int, db: Session) -> list[int]:
    return [m.user_id for m in db.query(TeamMember).filter(TeamMember.org_id == org_id).all()]


def _get_monitors(
    org_id: Optional[int],
    current_user: User,
    db: Session,
) -> list[Monitor]:
    """
    Return monitors in scope for a report.
    If org_id given: monitors with org_id = that org  OR  user-owned by any org member.
    If not given: monitors owned by current_user.
    """
    if org_id is not None:
        member_ids = _org_member_user_ids(org_id, db)
        return (
            db.query(Monitor)
            .filter(
                (Monitor.org_id == org_id)
                | (
                    (Monitor.org_id.is_(None))
                    & (Monitor.user_id.in_(member_ids))
                )
            )
            .all()
        )
    return db.query(Monitor).filter(Monitor.user_id == current_user.id).all()


def _compute_uptime_data(monitors: list[Monitor], since: datetime, db: Session) -> list[dict]:
    results = []
    for mon in monitors:
        logs = (
            db.query(MonitorLog)
            .filter(MonitorLog.monitor_id == mon.id, MonitorLog.checked_at >= since)
            .all()
        )
        total = len(logs)
        down = sum(1 for l in logs if not l.is_up)
        up = total - down
        uptime_pct = (up / total * 100) if total else 100.0
        downtime_pct = (down / total * 100) if total else 0.0
        rt_values = [l.response_time for l in logs if l.response_time is not None]
        avg_rt = sum(rt_values) / len(rt_values) if rt_values else 0.0
        results.append(
            {
                "name": mon.monitor_name,
                "url": mon.target_url,
                "uptime_pct": round(uptime_pct, 4),
                "downtime_pct": round(downtime_pct, 4),
                "avg_response_time": round(avg_rt, 2),
                "sla_achieved": uptime_pct >= 99.9,
                "total_checks": total,
                "down_checks": down,
                "monitor_id": mon.id,
            }
        )
    return results


def _compute_incident_data(monitors: list[Monitor], since: datetime, db: Session) -> dict:
    monitor_ids = [m.id for m in monitors]
    monitor_name_map = {m.id: m.monitor_name for m in monitors}

    incidents = (
        db.query(Incident)
        .filter(
            Incident.monitor_id.in_(monitor_ids),
            Incident.outage_start_time >= since,
        )
        .order_by(Incident.outage_start_time.desc())
        .all()
    )

    resolved = [i for i in incidents if i.incident_status == "resolved"]
    ongoing = [i for i in incidents if i.incident_status == "ongoing"]

    now = datetime.now(timezone.utc)
    resolution_times = []
    for inc in resolved:
        if inc.recovery_time and inc.outage_start_time:
            start = inc.outage_start_time
            end = inc.recovery_time
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
            resolution_times.append((end - start).total_seconds() / 60)

    avg_res = sum(resolution_times) / len(resolution_times) if resolution_times else 0.0

    def _dur(inc: Incident) -> float:
        start = inc.outage_start_time
        end = inc.recovery_time or now
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return round((end - start).total_seconds() / 60, 1)

    inc_list = [
        {
            "id": inc.id,
            "monitor_name": monitor_name_map.get(inc.monitor_id, "Unknown"),
            "started_at": inc.outage_start_time.isoformat() if inc.outage_start_time else None,
            "resolved_at": inc.recovery_time.isoformat() if inc.recovery_time else None,
            "duration_mins": _dur(inc),
            "status": inc.incident_status,
            "error": inc.error_message,
        }
        for inc in incidents
    ]

    return {
        "total_incidents": len(incidents),
        "resolved": len(resolved),
        "ongoing": len(ongoing),
        "avg_resolution_mins": round(avg_res, 1),
        "incidents": inc_list,
    }


def _build_summary(
    org: Optional[Organization],
    monitors: list[Monitor],
    period: str,
    since: datetime,
    db: Session,
) -> dict:
    uptime_data = _compute_uptime_data(monitors, since, db)
    inc_data = _compute_incident_data(monitors, since, db)

    total = len(uptime_data)
    avg_uptime = (
        sum(m["uptime_pct"] for m in uptime_data) / total if total else 0.0
    )
    sla_ok = sum(1 for m in uptime_data if m["sla_achieved"])
    sla_pct = (sla_ok / total * 100) if total else 0.0
    avg_rt = (
        sum(m["avg_response_time"] for m in uptime_data) / total if total else 0.0
    )

    best = max(uptime_data, key=lambda m: m["uptime_pct"], default=None)
    worst = min(uptime_data, key=lambda m: m["uptime_pct"], default=None)

    recommendations: list[str] = []
    if avg_uptime < 99.9:
        recommendations.append(
            f"Overall average uptime is {avg_uptime:.2f}%, below the 99.9% SLA target."
        )
    if inc_data["ongoing"] > 0:
        recommendations.append(
            f"There are {inc_data['ongoing']} ongoing incident(s) requiring immediate attention."
        )
    if avg_rt > 1000:
        recommendations.append(
            f"Average response time ({avg_rt:.0f} ms) is above 1 s — review slow monitors."
        )
    if not recommendations:
        recommendations.append("All monitors are performing within acceptable thresholds.")

    return {
        "org_name": org.name if org else "My Monitors",
        "period": period,
        "total_monitors": total,
        "avg_uptime": round(avg_uptime, 4),
        "sla_compliance_pct": round(sla_pct, 2),
        "total_incidents": inc_data["total_incidents"],
        "avg_response_time": round(avg_rt, 2),
        "best_monitor": (
            {"name": best["name"], "uptime": best["uptime_pct"]} if best else None
        ),
        "worst_monitor": (
            {"name": worst["name"], "uptime": worst["uptime_pct"]} if worst else None
        ),
        "recommendations": recommendations,
    }


# ── JSON data endpoints ────────────────────────────────────────────────────────

@router.get("/uptime")
def report_uptime(
    org_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-monitor uptime metrics for the last N days."""
    if org_id is not None:
        _get_org_or_403(org_id, current_user.id, db)
    monitors = _get_monitors(org_id, current_user, db)
    since = _since(days)
    period = f"Last {days} days"
    raw = _compute_uptime_data(monitors, since, db)

    total = len(raw)
    avg_uptime_pct = sum(m["uptime_pct"] for m in raw) / total if total else 100.0
    sla_compliant_count = sum(1 for m in raw if m["sla_achieved"])
    overall_sla_pct = (sla_compliant_count / total * 100) if total else 100.0
    total_downtime_hours = sum((m["downtime_pct"] / 100) * days * 24 for m in raw)

    monitor_ids = [m["monitor_id"] for m in raw]
    mon_obj_map = {m.id: m for m in monitors}

    last_inc_rows = (
        db.query(
            Incident.monitor_id,
            func.max(Incident.outage_start_time).label("last_start"),
        )
        .filter(Incident.monitor_id.in_(monitor_ids))
        .group_by(Incident.monitor_id)
        .all()
    ) if monitor_ids else []
    last_inc_map: dict = {
        row.monitor_id: row.last_start.isoformat() if row.last_start else None
        for row in last_inc_rows
    }

    all_logs = (
        db.query(MonitorLog)
        .filter(MonitorLog.monitor_id.in_(monitor_ids), MonitorLog.checked_at >= since)
        .all()
    ) if monitor_ids else []

    day_bucket: dict = defaultdict(list)
    for log in all_logs:
        checked = log.checked_at
        if checked:
            if checked.tzinfo is None:
                checked = checked.replace(tzinfo=timezone.utc)
            day_bucket[checked.strftime("%b %d")].append(log)

    now = datetime.now(timezone.utc)
    uptime_trend = []
    response_trend = []
    for i in range(days - 1, -1, -1):
        day_start = now - timedelta(days=i + 1)
        label = day_start.strftime("%b %d")
        bucket = day_bucket.get(label, [])
        total_b = len(bucket)
        up_b = sum(1 for lg in bucket if lg.is_up)
        day_up = (up_b / total_b * 100) if total_b else 100.0
        rt_vals = [lg.response_time for lg in bucket if lg.response_time is not None]
        avg_rt = sum(rt_vals) / len(rt_vals) if rt_vals else 0.0
        uptime_trend.append({"date": label, "uptime": round(day_up, 3)})
        response_trend.append({"date": label, "response_time": round(avg_rt, 2)})

    monitors_out = [
        {
            "id": m["monitor_id"],
            "name": m["name"],
            "status": mon_obj_map[m["monitor_id"]].current_status
                      if m["monitor_id"] in mon_obj_map else "unknown",
            "uptime_pct": m["uptime_pct"],
            "downtime_pct": m["downtime_pct"],
            "avg_response_ms": m["avg_response_time"],
            "sla_compliant": m["sla_achieved"],
            "last_incident": last_inc_map.get(m["monitor_id"]),
        }
        for m in raw
    ]

    return {
        "period": period,
        "days": days,
        "total_monitors": total,
        "avg_uptime_pct": round(avg_uptime_pct, 4),
        "sla_compliant_count": sla_compliant_count,
        "total_downtime_hours": round(total_downtime_hours, 2),
        "overall_sla_pct": round(overall_sla_pct, 2),
        "uptime_trend": uptime_trend,
        "response_trend": response_trend,
        "monitors": monitors_out,
    }


@router.get("/incidents")
def report_incidents(
    org_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Incident statistics and list for the last N days."""
    if org_id is not None:
        _get_org_or_403(org_id, current_user.id, db)
    monitors = _get_monitors(org_id, current_user, db)
    since = _since(days)
    raw = _compute_incident_data(monitors, since, db)

    # Build ordered daily counts
    now = datetime.now(timezone.utc)
    day_count_map: dict = {}
    for i in range(days - 1, -1, -1):
        day_start = now - timedelta(days=i + 1)
        day_count_map[day_start.strftime("%b %d")] = 0
    for inc in raw["incidents"]:
        if inc["started_at"]:
            try:
                dt_str = inc["started_at"].replace("Z", "+00:00")
                dt = datetime.fromisoformat(dt_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                label = dt.strftime("%b %d")
                if label in day_count_map:
                    day_count_map[label] += 1
            except (ValueError, AttributeError):
                pass
    daily_counts = [{"date": d, "count": c} for d, c in day_count_map.items()]

    incidents_out = [
        {
            "id": inc["id"],
            "monitor_name": inc["monitor_name"],
            "started_at": inc["started_at"],
            "resolved_at": inc.get("resolved_at"),
            "duration_minutes": inc["duration_mins"],
            "status": inc["status"],
            "error_message": inc.get("error"),
        }
        for inc in raw["incidents"]
    ]

    return {
        "period": f"Last {days} days",
        "total_incidents": raw["total_incidents"],
        "resolved_count": raw["resolved"],
        "ongoing_count": raw["ongoing"],
        "avg_resolution_minutes": raw["avg_resolution_mins"],
        "incidents": incidents_out,
        "daily_counts": daily_counts,
    }


@router.get("/team-activity")
def report_team_activity(
    org_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Audit log entries (team activity) for the last N days."""
    since = _since(days)

    if org_id is not None:
        _get_org_or_403(org_id, current_user.id, db)
        user_ids = _org_member_user_ids(org_id, db)
    else:
        user_ids = [current_user.id]

    logs = (
        db.query(AuditLog)
        .filter(
            AuditLog.user_id.in_(user_ids),
            AuditLog.created_at >= since,
        )
        .order_by(AuditLog.created_at.desc())
        .limit(500)
        .all()
    )

    user_name_map: dict[int, str] = {}
    for uid in {log.user_id for log in logs if log.user_id}:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            user_name_map[uid] = u.name

    action_counts: Counter = Counter()
    activities_out = []
    for log in logs:
        uname = user_name_map.get(log.user_id, "Unknown")
        action_counts[uname] += 1
        resource = log.resource_type or ""
        if log.resource_id:
            resource = f"{resource} #{log.resource_id}" if resource else f"#{log.resource_id}"
        activities_out.append({
            "id": log.id,
            "user_name": uname,
            "action": log.action,
            "resource": resource,
            "timestamp": log.created_at.isoformat() if log.created_at else None,
        })

    actions_per_user = [
        {"user_name": name, "action_count": count}
        for name, count in action_counts.most_common()
    ]

    return {
        "activities": activities_out,
        "actions_per_user": actions_per_user,
    }


@router.get("/summary")
def report_summary(
    org_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Executive summary for the last N days."""
    org = None
    if org_id is not None:
        org = _get_org_or_403(org_id, current_user.id, db)
    monitors = _get_monitors(org_id, current_user, db)
    since = _since(days)
    period = f"Last {days} days"
    raw = _build_summary(org, monitors, period, since, db)

    # Compute prev-period data for deltas
    prev_since = since - timedelta(days=days)
    prev_uptime_data = _compute_uptime_data(monitors, prev_since, db)
    prev_total = len(prev_uptime_data)
    prev_avg_uptime = (
        sum(m["uptime_pct"] for m in prev_uptime_data) / prev_total
        if prev_total else 100.0
    )
    prev_inc_data = _compute_incident_data(monitors, prev_since, db)

    # Performance score (0-100)
    avg_uptime = raw["avg_uptime"]
    sla_pct = raw["sla_compliance_pct"]
    total_incidents = raw["total_incidents"]
    avg_rt = raw["avg_response_time"]
    incident_penalty = min(40, total_incidents * 2)
    rt_score = max(0.0, 100.0 - (avg_rt / 20.0))
    perf = (avg_uptime * 0.4 + sla_pct * 0.3 + (100 - incident_penalty) * 0.2 + rt_score * 0.1)
    performance_score = max(0, min(100, round(perf)))

    # Build sorted lists for best/worst monitors
    uptime_data = _compute_uptime_data(monitors, since, db)
    sorted_asc = sorted(uptime_data, key=lambda m: m["uptime_pct"])
    best_monitors = [
        {"name": m["name"], "uptime_pct": m["uptime_pct"]}
        for m in reversed(sorted_asc[-3:])
    ]
    worst_monitors = [
        {"name": m["name"], "uptime_pct": m["uptime_pct"]}
        for m in sorted_asc[:3]
    ]

    return {
        "org_name": raw["org_name"],
        "plan": "Free",
        "overall_uptime_pct": round(avg_uptime, 4),
        "sla_compliance_pct": raw["sla_compliance_pct"],
        "performance_score": performance_score,
        "total_incidents": total_incidents,
        "best_monitors": best_monitors,
        "worst_monitors": worst_monitors,
        "recommendations": raw["recommendations"],
        "prev_period_uptime": round(prev_avg_uptime, 4),
        "prev_period_incidents": prev_inc_data["total_incidents"],
    }


# ── Export endpoints ───────────────────────────────────────────────────────────

@router.get("/export/pdf")
def export_pdf(
    org_id: Optional[int] = Query(None),
    report_type: str = Query("summary", regex="^(uptime|incidents|summary)$"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and download a PDF report."""
    org = None
    if org_id is not None:
        org = _get_org_or_403(org_id, current_user.id, db)
    monitors = _get_monitors(org_id, current_user, db)
    since = _since(days)
    period = f"Last {days} days"

    if report_type == "uptime":
        data = _compute_uptime_data(monitors, since, db)
        pdf_bytes = _pdf_gen.generate_uptime_report(org, data, period)
        filename = "uptime_report.pdf"
    elif report_type == "incidents":
        data = _compute_incident_data(monitors, since, db)
        pdf_bytes = _pdf_gen.generate_incident_report(org, data, period)
        filename = "incidents_report.pdf"
    else:
        data = _build_summary(org, monitors, period, since, db)
        pdf_bytes = _pdf_gen.generate_summary_report(org, data, period)
        filename = "summary_report.pdf"

    log_action(
        db,
        user_id=current_user.id,
        action="report.export.pdf",
        resource_type="report",
        details={"report_type": report_type, "days": days, "org_id": org_id},
    )
    db.commit()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/csv")
def export_csv(
    org_id: Optional[int] = Query(None),
    report_type: str = Query("uptime", regex="^(uptime|incidents|team_activity)$"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream a CSV report download."""
    org = None
    if org_id is not None:
        org = _get_org_or_403(org_id, current_user.id, db)
    monitors = _get_monitors(org_id, current_user, db)
    since = _since(days)
    period = f"Last {days} days"

    def _csv_uptime():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "Monitor Name",
                "URL",
                "Uptime %",
                "Downtime %",
                "Avg Response Time (ms)",
                "Total Checks",
                "Down Checks",
                "SLA Achieved",
            ]
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        data = _compute_uptime_data(monitors, since, db)
        for m in data:
            writer.writerow(
                [
                    m["name"],
                    m["url"],
                    m["uptime_pct"],
                    m["downtime_pct"],
                    m["avg_response_time"],
                    m["total_checks"],
                    m["down_checks"],
                    "YES" if m["sla_achieved"] else "NO",
                ]
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    def _csv_incidents():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            ["ID", "Monitor Name", "Started At", "Resolved At", "Duration (mins)", "Status", "Error"]
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        data = _compute_incident_data(monitors, since, db)
        for inc in data["incidents"]:
            writer.writerow(
                [
                    inc["id"],
                    inc["monitor_name"],
                    inc["started_at"],
                    inc["resolved_at"] or "Ongoing",
                    inc["duration_mins"],
                    inc["status"],
                    inc["error"] or "",
                ]
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    def _csv_team_activity():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            ["User Name", "Action", "Resource Type", "Resource ID", "Details", "Created At"]
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        if org_id is not None:
            user_ids = _org_member_user_ids(org_id, db)
        else:
            user_ids = [current_user.id]
        logs = (
            db.query(AuditLog)
            .filter(AuditLog.user_id.in_(user_ids), AuditLog.created_at >= since)
            .order_by(AuditLog.created_at.desc())
            .limit(5000)
            .all()
        )
        user_name_map: dict[int, str] = {}
        for uid in {log.user_id for log in logs if log.user_id}:
            u = db.query(User).filter(User.id == uid).first()
            if u:
                user_name_map[uid] = u.name

        for log in logs:
            writer.writerow(
                [
                    user_name_map.get(log.user_id, "Unknown"),
                    log.action,
                    log.resource_type or "",
                    log.resource_id or "",
                    log.details or "",
                    log.created_at.isoformat() if log.created_at else "",
                ]
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    generators = {
        "uptime": (_csv_uptime, "uptime_report.csv"),
        "incidents": (_csv_incidents, "incidents_report.csv"),
        "team_activity": (_csv_team_activity, "team_activity.csv"),
    }
    gen_fn, filename = generators[report_type]

    log_action(
        db,
        user_id=current_user.id,
        action="report.export.csv",
        resource_type="report",
        details={"report_type": report_type, "days": days, "org_id": org_id},
    )
    db.commit()

    return StreamingResponse(
        gen_fn(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/excel")
def export_excel(
    org_id: Optional[int] = Query(None),
    report_type: str = Query("summary", regex="^(uptime|incidents|summary)$"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and download an Excel (.xlsx) report."""
    org = None
    if org_id is not None:
        org = _get_org_or_403(org_id, current_user.id, db)
    monitors = _get_monitors(org_id, current_user, db)
    since = _since(days)
    period = f"Last {days} days"

    if report_type == "uptime":
        data = _compute_uptime_data(monitors, since, db)
        xls_bytes = _xls_gen.generate_uptime_report(org, data, period)
        filename = "uptime_report.xlsx"
    elif report_type == "incidents":
        data = _compute_incident_data(monitors, since, db)
        xls_bytes = _xls_gen.generate_incident_report(org, data, period)
        filename = "incidents_report.xlsx"
    else:
        data = _build_summary(org, monitors, period, since, db)
        xls_bytes = _xls_gen.generate_summary_report(org, data, period)
        filename = "summary_report.xlsx"

    log_action(
        db,
        user_id=current_user.id,
        action="report.export.excel",
        resource_type="report",
        details={"report_type": report_type, "days": days, "org_id": org_id},
    )
    db.commit()

    return Response(
        content=xls_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/json")
def export_json(
    org_id: Optional[int] = Query(None),
    report_type: str = Query("summary", regex="^(uptime|incidents|summary)$"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and download a JSON report file."""
    org = None
    if org_id is not None:
        org = _get_org_or_403(org_id, current_user.id, db)
    monitors = _get_monitors(org_id, current_user, db)
    since = _since(days)
    period = f"Last {days} days"

    if report_type == "uptime":
        payload = {
            "period": period,
            "days": days,
            "monitors": _compute_uptime_data(monitors, since, db),
        }
        filename = "uptime_report.json"
    elif report_type == "incidents":
        payload = _compute_incident_data(monitors, since, db)
        payload["period"] = period
        filename = "incidents_report.json"
    else:
        payload = _build_summary(org, monitors, period, since, db)
        filename = "summary_report.json"

    log_action(
        db,
        user_id=current_user.id,
        action="report.export.json",
        resource_type="report",
        details={"report_type": report_type, "days": days, "org_id": org_id},
    )
    db.commit()

    json_bytes = json.dumps(payload, indent=2, default=str).encode("utf-8")
    return Response(
        content=json_bytes,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
