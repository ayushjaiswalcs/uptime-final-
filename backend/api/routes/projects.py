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
from models.project import Project, ProjectMember
from models.team import Team
from models.user import User
from schemas.project import ProjectCreate, ProjectOut, ProjectUpdate, ProjectMemberOut, AddProjectMember

router = APIRouter(prefix="/projects", tags=["projects"])


def _assert_org_access(org_id: int, user_id: int, db: Session, require_admin: bool = False) -> None:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    member = db.query(TeamMember).filter(TeamMember.org_id == org_id, TeamMember.user_id == user_id).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    if require_admin and member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")


def _enrich_project(project: Project, db: Session) -> ProjectOut:
    out = ProjectOut.model_validate(project)
    out.monitor_count = db.query(Monitor).filter(Monitor.project_id == project.id).count()
    out.member_count = db.query(ProjectMember).filter(ProjectMember.project_id == project.id).count()
    if project.team_id:
        team = db.query(Team).filter(Team.id == project.team_id).first()
        out.team_name = team.name if team else None
    return out


@router.get("", response_model=List[ProjectOut])
def list_projects(org_id: int, team_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_org_access(org_id, current_user.id, db)
    q = db.query(Project).filter(Project.org_id == org_id)
    if team_id is not None:
        q = q.filter(Project.team_id == team_id)
    return [_enrich_project(p, db) for p in q.all()]


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(data: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_org_access(data.org_id, current_user.id, db)
    project = Project(
        org_id=data.org_id,
        team_id=data.team_id,
        name=data.name,
        description=data.description,
        status=data.status or "active",
        priority=data.priority or "medium",
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(project)
    db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=current_user.id, role="owner"))
    log_action(db, user_id=current_user.id, action="project.create", resource_type="project",
               resource_id=project.id, details={"name": data.name, "org_id": data.org_id})
    db.commit()
    db.refresh(project)
    return _enrich_project(project, db)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _assert_org_access(project.org_id, current_user.id, db)
    return _enrich_project(project, db)


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _assert_org_access(project.org_id, current_user.id, db)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return _enrich_project(project, db)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _assert_org_access(project.org_id, current_user.id, db, require_admin=True)
    log_action(db, user_id=current_user.id, action="project.delete", resource_type="project",
               resource_id=project_id, details={"name": project.name})
    db.delete(project)
    db.commit()


# ── Members ──────────────────────────────────────────────────────────────────

@router.get("/{project_id}/members", response_model=List[ProjectMemberOut])
def list_project_members(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _assert_org_access(project.org_id, current_user.id, db)
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    result = []
    for m in members:
        user = db.query(User).filter(User.id == m.user_id).first()
        out = ProjectMemberOut.model_validate(m)
        if user:
            out.user_name = user.name
            out.user_email = user.email
        result.append(out)
    return result


@router.post("/{project_id}/members", status_code=201)
def add_project_member(project_id: int, data: AddProjectMember, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _assert_org_access(project.org_id, current_user.id, db)
    existing = db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id == data.user_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already a project member")
    db.add(ProjectMember(project_id=project_id, user_id=data.user_id, role=data.role))
    db.commit()
    return {"message": "Member added"}


@router.delete("/{project_id}/members/{member_id}", status_code=204)
def remove_project_member(project_id: int, member_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _assert_org_access(project.org_id, current_user.id, db)
    m = db.query(ProjectMember).filter(ProjectMember.id == member_id, ProjectMember.project_id == project_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(m)
    db.commit()


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/{project_id}/stats")
def get_project_stats(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _assert_org_access(project.org_id, current_user.id, db)

    monitors = db.query(Monitor).filter(Monitor.project_id == project_id).all()
    monitor_ids = [m.id for m in monitors]
    since_30 = datetime.now(timezone.utc) - timedelta(days=30)

    total_monitors = len(monitors)
    active_monitors = sum(1 for m in monitors if not m.is_paused)
    down_monitors = sum(1 for m in monitors if m.current_status == "down")

    incident_count = (
        db.query(Incident).filter(Incident.monitor_id.in_(monitor_ids), Incident.outage_start_time >= since_30).count()
        if monitor_ids else 0
    )
    open_incidents = (
        db.query(Incident).filter(Incident.monitor_id.in_(monitor_ids), Incident.incident_status == "ongoing").count()
        if monitor_ids else 0
    )

    sla_scores: list[float] = []
    all_rt: list[float] = []
    for mon in monitors:
        logs = db.query(MonitorLog).filter(MonitorLog.monitor_id == mon.id, MonitorLog.checked_at >= since_30).all()
        if logs:
            sla_scores.append(sum(1 for l in logs if l.is_up) / len(logs) * 100)
            all_rt.extend(l.response_time for l in logs if l.response_time)

    avg_uptime = round(sum(sla_scores) / len(sla_scores), 2) if sla_scores else 100.0
    avg_response_time = round(sum(all_rt) / len(all_rt), 2) if all_rt else 0.0
    health_score = min(100, round(avg_uptime * 0.6 + max(0, (1000 - avg_response_time) / 10) * 0.25 + (0 if open_incidents else 15), 1))

    member_count = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).count()

    return {
        "total_monitors": total_monitors,
        "active_monitors": active_monitors,
        "down_monitors": down_monitors,
        "incident_count": incident_count,
        "open_incidents": open_incidents,
        "member_count": member_count,
        "avg_uptime": avg_uptime,
        "avg_response_time": avg_response_time,
        "health_score": health_score,
        "sla_compliance": avg_uptime >= 99.9,
    }
