from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from core.database import get_db
from core.deps import require_roles
from infra.models import Candidate, Job

router = APIRouter(prefix="/export", tags=["export"])

ALLOWED = ("admin", "kam", "delivery_lead")


def _af(a, field, suffix=""):
    """Safe assessment field accessor — returns '—' when assessment is None or field is None."""
    if a is None:
        return "—"
    val = getattr(a, field, None)
    if val is None or val == "":
        return "—"
    return f"{val}{suffix}"


@router.get("/candidates")
def export_candidates(
    account_manager_id: int | None = Query(None),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_roles(*ALLOWED)),
):
    """Structured candidate data for the Export/Reports page."""
    q = (
        db.query(Candidate)
        .options(
            joinedload(Candidate.job).joinedload(Job.account_manager),
            joinedload(Candidate.assessment),
            joinedload(Candidate.sourced_by),
            joinedload(Candidate.assigned_to),
        )
        .join(Candidate.job)
        .order_by(Job.account_manager_id, Job.client_name, Candidate.full_name)
    )

    if account_manager_id:
        q = q.filter(Job.account_manager_id == account_manager_id)
    if status:
        q = q.filter(Candidate.status == status)

    rows = []
    for c in q.all():
        j = c.job
        a = c.assessment

        rows.append({
            # JD Info
            "account_manager":      j.account_manager.name if j and j.account_manager else "—",
            "client_name":          j.client_name if j else "—",
            "job_title":            j.role_title  if j else "—",
            # Candidate basics
            "candidate_name":       c.full_name or "—",
            "mobile":               c.mobile or "—",
            "email":                c.email or "—",
            "linkedin":             c.linkedin_url or "—",
            "city":                 c.city or "—",
            "current_company":      c.current_company or _af(a, "last_company"),
            "candidate_status":     c.status.value.replace("_", " ").title() if c.status else "—",
            "lead_source":          c.lead_source or "—",
            # Team
            "sourced_by":           c.sourced_by.name if c.sourced_by else "—",
            "caller":               c.assigned_to.name if c.assigned_to else "—",
            "sourcing_date":        c.sourcing_date or "—",
            # Assessment — safe access via _af
            "total_exp":            _af(a, "total_exp", " yrs"),
            "relevant_exp":         _af(a, "relevant_exp", " yrs"),
            "skills":               (a.primary_skill_stack or c.skills or "—") if a else (c.skills or "—"),
            "current_ctc":          _af(a, "current_ctc", " LPA"),
            "expected_ctc":         _af(a, "expected_ctc", " LPA"),
            "hike_pct":             _af(a, "hike_pct", "%"),
            "notice_period":        _af(a, "notice_period_weeks", " wks"),
            "last_working_day":     _af(a, "last_working_day"),
            "deploying_client":     _af(a, "deploying_client"),
            "reason_for_change":    _af(a, "reason_for_change"),
            "offers_in_hand":       _af(a, "offers_in_hand"),
            "current_city":         _af(a, "current_city"),
            # Scores
            "comm_score":           _af(a, "comm_score"),
            "tech_score":           _af(a, "tech_score"),
            "soft_skill_score":     _af(a, "soft_skill_score"),
            "overall_score":        _af(a, "overall_score"),
            "auto_recommendation":  _af(a, "auto_recommendation"),
            "pass_to_validation":   _af(a, "pass_to_validation"),
        })

    return rows
