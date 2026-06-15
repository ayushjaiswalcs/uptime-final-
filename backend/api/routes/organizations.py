import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user
from models.organization import Organization, TeamMember
from models.user import User
from schemas.organization import OrgCreate, OrgOut, OrgUpdate, MemberOut, InviteMember, UpdateMemberRole

router = APIRouter(prefix="/organizations", tags=["organizations"])

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{1,98}[a-z0-9]$")


def _validate_slug(slug: str) -> None:
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=422, detail="Slug must be lowercase alphanumeric with hyphens")


@router.get("", response_model=List[OrgOut])
def list_orgs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    owned = db.query(Organization).filter(Organization.owner_id == current_user.id).all()
    member_org_ids = [m.org_id for m in db.query(TeamMember).filter(TeamMember.user_id == current_user.id).all()]
    member_orgs = db.query(Organization).filter(Organization.id.in_(member_org_ids)).all() if member_org_ids else []
    seen = {o.id for o in owned}
    return owned + [o for o in member_orgs if o.id not in seen]


@router.post("", response_model=OrgOut, status_code=201)
def create_org(data: OrgCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _validate_slug(data.slug)
    if db.query(Organization).filter(Organization.slug == data.slug).first():
        raise HTTPException(status_code=400, detail="Slug already taken")
    org = Organization(name=data.name, slug=data.slug, owner_id=current_user.id, logo_url=data.logo_url)
    db.add(org)
    db.flush()
    db.add(TeamMember(org_id=org.id, user_id=current_user.id, role="owner"))
    db.commit()
    db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrgOut)
def get_org(org_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    org = _get_accessible_org(org_id, current_user.id, db)
    return org


@router.put("/{org_id}", response_model=OrgOut)
def update_org(org_id: int, data: OrgUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    org = _get_owned_org(org_id, current_user.id, db)
    if data.name:
        org.name = data.name
    if data.logo_url is not None:
        org.logo_url = data.logo_url
    db.commit()
    db.refresh(org)
    return org


@router.delete("/{org_id}", status_code=204)
def delete_org(org_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    org = _get_owned_org(org_id, current_user.id, db)
    db.delete(org)
    db.commit()


@router.get("/{org_id}/members", response_model=List[MemberOut])
def list_members(org_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_accessible_org(org_id, current_user.id, db)
    members = db.query(TeamMember).filter(TeamMember.org_id == org_id).all()
    result = []
    for m in members:
        user = db.query(User).filter(User.id == m.user_id).first()
        out = MemberOut.model_validate(m)
        if user:
            out.user_name = user.name
            out.user_email = user.email
        result.append(out)
    return result


@router.post("/{org_id}/members", status_code=201)
def invite_member(org_id: int, data: InviteMember, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_owned_or_admin_org(org_id, current_user.id, db)
    target = db.query(User).filter(User.email == data.email).first()
    if not target:
        raise HTTPException(status_code=404, detail="No user found with that email")
    exists = db.query(TeamMember).filter(TeamMember.org_id == org_id, TeamMember.user_id == target.id).first()
    if exists:
        raise HTTPException(status_code=400, detail="User is already a member")
    db.add(TeamMember(org_id=org_id, user_id=target.id, role=data.role, invited_by=current_user.id))
    db.commit()
    return {"message": f"{target.name} added to organization"}


@router.put("/{org_id}/members/{member_id}")
def update_member_role(org_id: int, member_id: int, data: UpdateMemberRole, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_owned_org(org_id, current_user.id, db)
    member = db.query(TeamMember).filter(TeamMember.id == member_id, TeamMember.org_id == org_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.role = data.role
    db.commit()
    return {"role": member.role}


@router.delete("/{org_id}/members/{member_id}", status_code=204)
def remove_member(org_id: int, member_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_owned_or_admin_org(org_id, current_user.id, db)
    member = db.query(TeamMember).filter(TeamMember.id == member_id, TeamMember.org_id == org_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()


# ── helpers ─────────────────────────────────────────────────────────────────
def _get_accessible_org(org_id: int, user_id: int, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    is_member = db.query(TeamMember).filter(TeamMember.org_id == org_id, TeamMember.user_id == user_id).first()
    if not is_member and org.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return org


def _get_owned_org(org_id: int, user_id: int, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id, Organization.owner_id == user_id).first()
    if not org:
        raise HTTPException(status_code=403, detail="Organization not found or access denied")
    return org


def _get_owned_or_admin_org(org_id: int, user_id: int, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    member = db.query(TeamMember).filter(TeamMember.org_id == org_id, TeamMember.user_id == user_id).first()
    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return org
