from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from core.deps import get_db, get_current_user
from models.user import User
from models.compliance import ComplianceFramework, ComplianceControl, ComplianceAssessment, DataRetentionPolicy

router = APIRouter(prefix="/compliance", tags=["compliance"])

SEED_FRAMEWORKS = [
    {
        "name": "SOC 2 Type II",
        "description": "Service Organization Control 2 - Security, Availability, Processing Integrity, Confidentiality, Privacy",
        "version": "2017",
        "controls": [
            {"control_id": "CC1.1", "title": "COSO Principle 1", "category": "Control Environment", "description": "Demonstrates commitment to integrity and ethical values"},
            {"control_id": "CC1.2", "title": "COSO Principle 2", "category": "Control Environment", "description": "Board independence and oversight of internal controls"},
            {"control_id": "CC2.1", "title": "COSO Principle 6", "category": "Communication", "description": "Specifies and uses quality information"},
            {"control_id": "CC3.1", "title": "COSO Principle 6", "category": "Risk Assessment", "description": "Specifies suitable objectives"},
            {"control_id": "CC6.1", "title": "Logical Access", "category": "Logical Access Controls", "description": "Implements logical access security measures"},
            {"control_id": "CC6.2", "title": "Authentication", "category": "Logical Access Controls", "description": "Registers and authorizes users prior to system access"},
            {"control_id": "CC6.3", "title": "Access Restriction", "category": "Logical Access Controls", "description": "Restricts access based on authorization"},
            {"control_id": "CC7.1", "title": "System Monitoring", "category": "System Operations", "description": "Detects and monitors system configuration changes"},
            {"control_id": "CC7.2", "title": "Anomaly Detection", "category": "System Operations", "description": "Monitors system components for anomalies"},
            {"control_id": "CC9.1", "title": "Risk Mitigation", "category": "Risk Mitigation", "description": "Identifies and manages risk of business disruption"},
            {"control_id": "A1.1", "title": "Availability Processing", "category": "Availability", "description": "Maintains current processing capacity"},
            {"control_id": "A1.2", "title": "Availability Monitoring", "category": "Availability", "description": "Monitors environmental threats"},
        ]
    },
    {
        "name": "ISO 27001",
        "description": "International standard for information security management systems",
        "version": "2022",
        "controls": [
            {"control_id": "A.5.1", "title": "Information Security Policies", "category": "Organizational Controls", "description": "Policies for information security"},
            {"control_id": "A.5.2", "title": "Information Security Roles", "category": "Organizational Controls", "description": "Information security roles and responsibilities"},
            {"control_id": "A.8.1", "title": "Asset Inventory", "category": "Asset Management", "description": "Inventory of assets"},
            {"control_id": "A.8.2", "title": "Asset Classification", "category": "Asset Management", "description": "Classification of information"},
            {"control_id": "A.9.1", "title": "Access Control Policy", "category": "Access Control", "description": "Access control policy"},
            {"control_id": "A.9.2", "title": "User Access Management", "category": "Access Control", "description": "User access management procedures"},
            {"control_id": "A.12.1", "title": "Operational Procedures", "category": "Operations Security", "description": "Documented operating procedures"},
            {"control_id": "A.12.6", "title": "Vulnerability Management", "category": "Operations Security", "description": "Management of technical vulnerabilities"},
            {"control_id": "A.16.1", "title": "Incident Management", "category": "Incident Management", "description": "Responsibilities and procedures for incident management"},
            {"control_id": "A.17.1", "title": "Business Continuity", "category": "Business Continuity", "description": "Planning information security continuity"},
        ]
    },
    {
        "name": "GDPR",
        "description": "General Data Protection Regulation - EU data protection and privacy law",
        "version": "2018",
        "controls": [
            {"control_id": "Art.5", "title": "Principles of Processing", "category": "Data Processing", "description": "Lawfulness, fairness and transparency of processing"},
            {"control_id": "Art.6", "title": "Lawfulness of Processing", "category": "Data Processing", "description": "Legal basis for processing personal data"},
            {"control_id": "Art.13", "title": "Privacy Notice", "category": "Transparency", "description": "Information to be provided at collection"},
            {"control_id": "Art.15", "title": "Right of Access", "category": "Data Subject Rights", "description": "Right of access by the data subject"},
            {"control_id": "Art.17", "title": "Right to Erasure", "category": "Data Subject Rights", "description": "Right to be forgotten"},
            {"control_id": "Art.25", "title": "Privacy by Design", "category": "Technical Measures", "description": "Data protection by design and by default"},
            {"control_id": "Art.32", "title": "Security of Processing", "category": "Technical Measures", "description": "Appropriate technical and organisational measures"},
            {"control_id": "Art.33", "title": "Breach Notification", "category": "Incident Management", "description": "Notification of personal data breaches"},
        ]
    }
]


def seed_frameworks(db: Session):
    if db.query(ComplianceFramework).count() > 0:
        return
    for fw_data in SEED_FRAMEWORKS:
        controls_data = fw_data.pop("controls", [])
        fw = ComplianceFramework(**fw_data)
        db.add(fw)
        db.flush()
        for c in controls_data:
            db.add(ComplianceControl(framework_id=fw.id, **c))
    db.commit()


class AssessmentUpdate(BaseModel):
    status: str
    evidence: Optional[str] = None
    notes: Optional[str] = None
    next_review: Optional[datetime] = None


class RetentionPolicyCreate(BaseModel):
    data_type: str
    retention_days: int
    auto_delete: bool = False


@router.get("/frameworks")
def list_frameworks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seed_frameworks(db)
    frameworks = db.query(ComplianceFramework).all()
    result = []
    for fw in frameworks:
        controls = db.query(ComplianceControl).filter(ComplianceControl.framework_id == fw.id).all()
        assessments = db.query(ComplianceAssessment).filter(
            ComplianceAssessment.user_id == current_user.id,
            ComplianceAssessment.control_id.in_([c.id for c in controls])
        ).all()
        assessed_map = {a.control_id: a.status for a in assessments}
        compliant = sum(1 for c in controls if assessed_map.get(c.id) == "compliant")
        result.append({
            "id": fw.id,
            "name": fw.name,
            "description": fw.description,
            "version": fw.version,
            "total_controls": len(controls),
            "compliant_controls": compliant,
            "compliance_pct": round(compliant / len(controls) * 100, 1) if controls else 0,
        })
    return result


@router.get("/frameworks/{framework_id}/controls")
def list_controls(framework_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seed_frameworks(db)
    controls = db.query(ComplianceControl).filter(ComplianceControl.framework_id == framework_id).all()
    assessments = db.query(ComplianceAssessment).filter(
        ComplianceAssessment.user_id == current_user.id,
        ComplianceAssessment.control_id.in_([c.id for c in controls])
    ).all()
    assess_map = {a.control_id: a for a in assessments}
    result = []
    for c in controls:
        a = assess_map.get(c.id)
        result.append({
            "id": c.id,
            "control_id": c.control_id,
            "title": c.title,
            "description": c.description,
            "category": c.category,
            "status": a.status if a else "not_started",
            "evidence": a.evidence if a else None,
            "notes": a.notes if a else None,
            "assessed_at": a.assessed_at if a else None,
            "next_review": a.next_review if a else None,
            "assessment_id": a.id if a else None,
        })
    return result


@router.put("/controls/{control_id}/assessment")
def update_assessment(
    control_id: int,
    body: AssessmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assessment = db.query(ComplianceAssessment).filter(
        ComplianceAssessment.control_id == control_id,
        ComplianceAssessment.user_id == current_user.id
    ).first()
    if not assessment:
        assessment = ComplianceAssessment(
            user_id=current_user.id,
            control_id=control_id,
        )
        db.add(assessment)

    assessment.status = body.status
    if body.evidence is not None:
        assessment.evidence = body.evidence
    if body.notes is not None:
        assessment.notes = body.notes
    if body.next_review is not None:
        assessment.next_review = body.next_review
    assessment.assessed_at = datetime.now()
    assessment.assessed_by = current_user.id
    db.commit()
    db.refresh(assessment)
    return {"ok": True, "assessment_id": assessment.id}


@router.get("/retention-policies")
def list_retention_policies(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(DataRetentionPolicy).filter(DataRetentionPolicy.user_id == current_user.id).all()


@router.post("/retention-policies")
def create_retention_policy(body: RetentionPolicyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(DataRetentionPolicy).filter(
        DataRetentionPolicy.user_id == current_user.id,
        DataRetentionPolicy.data_type == body.data_type
    ).first()
    if existing:
        existing.retention_days = body.retention_days
        existing.auto_delete = body.auto_delete
        db.commit()
        return existing
    policy = DataRetentionPolicy(user_id=current_user.id, **body.model_dump())
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.get("/summary")
def compliance_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seed_frameworks(db)
    frameworks = db.query(ComplianceFramework).all()
    total_controls = 0
    compliant_controls = 0
    for fw in frameworks:
        controls = db.query(ComplianceControl).filter(ComplianceControl.framework_id == fw.id).all()
        total_controls += len(controls)
        assessments = db.query(ComplianceAssessment).filter(
            ComplianceAssessment.user_id == current_user.id,
            ComplianceAssessment.control_id.in_([c.id for c in controls]),
            ComplianceAssessment.status == "compliant"
        ).count()
        compliant_controls += assessments
    return {
        "total_frameworks": len(frameworks),
        "total_controls": total_controls,
        "compliant_controls": compliant_controls,
        "overall_compliance_pct": round(compliant_controls / total_controls * 100, 1) if total_controls else 0,
    }
