from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.audit import log_action
from core.deps import get_db, get_current_user
from models.incident import Incident
from models.monitor import Monitor
from models.monitor_log import MonitorLog
from models.organization import Organization, TeamMember
from models.project import Project
from models.team import Team, TeamMembership
from models.user import User
from schemas.team import TeamCreate, TeamOut, TeamUpdate, TeamMembershipOut, AddTeamMember, UpdateTeamMemberRole

router = APIRouter(prefix="/teams", tags=["teams"])


def _assert_org_access(org_id: int, user_id: int, db: Session, require_admin: bool = False) -> None:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    member = db.query(TeamMember).filter(TeamMember.org_id == org_id, TeamMember.user_id == user_id).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    if require_admin and member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")


def _enrich_team(team: Team, db: Session) -> TeamOut:
    member_count = db.query(TeamMembership).filter(TeamMembership.team_id == team.id).count()
    project_count = db.query(Project).filter(Project.team_id == team.id).count()
    lead_name = None
    if team.lead_id:
        lead = db.query(User).filter(User.id == team.lead_id).first()
        lead_name = lead.name if lead else None
    out = TeamOut.model_validate(team)
    out.member_count = member_count
    out.project_count = project_count
    out.lead_name = lead_name
    return out


@router.get("", response_model=List[TeamOut])
def list_teams(org_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_org_access(org_id, current_user.id, db)
    teams = db.query(Team).filter(Team.org_id == org_id).all()
    return [_enrich_team(t, db) for t in teams]


@router.post("", response_model=TeamOut, status_code=201)
def create_team(data: TeamCreate, org_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_org_access(org_id, current_user.id, db, require_admin=False)
    team = Team(
        org_id=org_id,
        name=data.name,
        description=data.description,
        lead_id=data.lead_id or current_user.id,
        color=data.color or "#4F46E5",
    )
    db.add(team)
    db.flush()
    # Creator becomes the team lead member
    db.add(TeamMembership(team_id=team.id, user_id=current_user.id, role="lead"))
    log_action(db, user_id=current_user.id, action="team.create", resource_type="team",
               resource_id=team.id, details={"name": data.name, "org_id": org_id})
    db.commit()
    db.refresh(team)
    return _enrich_team(team, db)


@router.get("/{team_id}", response_model=TeamOut)
def get_team(team_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _assert_org_access(team.org_id, current_user.id, db)
    return _enrich_team(team, db)


@router.put("/{team_id}", response_model=TeamOut)
def update_team(team_id: int, data: TeamUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _assert_org_access(team.org_id, current_user.id, db, require_admin=True)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(team, field, value)
    db.commit()
    db.refresh(team)
    return _enrich_team(team, db)


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _assert_org_access(team.org_id, current_user.id, db, require_admin=True)
    log_action(db, user_id=current_user.id, action="team.delete", resource_type="team",
               resource_id=team_id, details={"name": team.name})
    db.delete(team)
    db.commit()


# ── Members ──────────────────────────────────────────────────────────────────

@router.get("/{team_id}/members", response_model=List[TeamMembershipOut])
def list_team_members(team_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _assert_org_access(team.org_id, current_user.id, db)
    memberships = db.query(TeamMembership).filter(TeamMembership.team_id == team_id).all()
    result = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        out = TeamMembershipOut.model_validate(m)
        if user:
            out.user_name = user.name
            out.user_email = user.email
        result.append(out)
    return result


@router.post("/{team_id}/members", status_code=201)
def add_team_member(team_id: int, data: AddTeamMember, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _assert_org_access(team.org_id, current_user.id, db, require_admin=True)
    existing = db.query(TeamMembership).filter(TeamMembership.team_id == team_id, TeamMembership.user_id == data.user_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already a team member")
    db.add(TeamMembership(team_id=team_id, user_id=data.user_id, role=data.role))
    db.commit()
    return {"message": "Member added"}


@router.delete("/{team_id}/members/{membership_id}", status_code=204)
def remove_team_member(team_id: int, membership_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _assert_org_access(team.org_id, current_user.id, db, require_admin=True)
    m = db.query(TeamMembership).filter(TeamMembership.id == membership_id, TeamMembership.team_id == team_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Membership not found")
    db.delete(m)
    db.commit()


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/{team_id}/stats")
def get_team_stats(team_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _assert_org_access(team.org_id, current_user.id, db)

    member_user_ids = [m.user_id for m in db.query(TeamMembership).filter(TeamMembership.team_id == team_id).all()]
    total_projects = db.query(Project).filter(Project.team_id == team_id).count()

    monitors = db.query(Monitor).filter(Monitor.team_id == team_id).all()
    if not monitors:
        monitors = db.query(Monitor).filter(Monitor.user_id.in_(member_user_ids)).all() if member_user_ids else []

    monitor_ids = [m.id for m in monitors]
    total_monitors = len(monitors)
    active_monitors = sum(1 for m in monitors if not m.is_paused)
    down_monitors = sum(1 for m in monitors if m.current_status == "down")

    since_30 = datetime.now(timezone.utc) - timedelta(days=30)

    monthly_incidents = (
        db.query(Incident).filter(Incident.monitor_id.in_(monitor_ids), Incident.outage_start_time >= since_30).count()
        if monitor_ids else 0
    )

    sla_scores: list[float] = []
    for mon in monitors:
        logs = db.query(MonitorLog).filter(MonitorLog.monitor_id == mon.id, MonitorLog.checked_at >= since_30).all()
        if logs:
            sla_scores.append(sum(1 for l in logs if l.is_up) / len(logs) * 100)
    avg_uptime = round(sum(sla_scores) / len(sla_scores), 2) if sla_scores else 100.0

    all_rt: list[float] = []
    for mon in monitors:
        logs = db.query(MonitorLog).filter(MonitorLog.monitor_id == mon.id, MonitorLog.checked_at >= since_30).all()
        all_rt.extend(l.response_time for l in logs if l.response_time)
    avg_response_time = round(sum(all_rt) / len(all_rt), 2) if all_rt else 0.0

    performance_score = min(100, round(avg_uptime * 0.7 + max(0, (1000 - avg_response_time) / 10) * 0.3, 1))

    return {
        "total_projects": total_projects,
        "total_monitors": total_monitors,
        "active_monitors": active_monitors,
        "down_monitors": down_monitors,
        "total_members": len(member_user_ids),
        "monthly_incidents": monthly_incidents,
        "avg_uptime": avg_uptime,
        "avg_response_time": avg_response_time,
        "performance_score": performance_score,
    }


# ── Activity Feed ─────────────────────────────────────────────────────────────

@router.get("/{team_id}/activity")
def get_team_activity(team_id: int, limit: int = 20, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from models.audit_log import AuditLog
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _assert_org_access(team.org_id, current_user.id, db)

    member_user_ids = [m.user_id for m in db.query(TeamMembership).filter(TeamMembership.team_id == team_id).all()]
    if not member_user_ids:
        return []

    logs = (
        db.query(AuditLog)
        .filter(AuditLog.user_id.in_(member_user_ids))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    result = []
    for log in logs:
        user = db.query(User).filter(User.id == log.user_id).first()
        result.append({
            "id": log.id,
            "user_name": user.name if user else "Unknown",
            "action": log.action,
            "resource_type": log.resource_type,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })
    return result
