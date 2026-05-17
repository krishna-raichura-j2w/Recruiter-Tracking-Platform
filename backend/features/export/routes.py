import json
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from core.database import get_db
from core.deps import require_roles
from infra.models import (
    Candidate, CandidateStatus, Job, JobStatus,
    User, UserRole, SubmissionTimeline, InterviewStage,
)

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
    business_head_id: int | None = Query(None),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_roles(*ALLOWED)),
):
    """Structured candidate data for the Export/Reports page."""
    q = (
        db.query(Candidate)
        .options(
            joinedload(Candidate.job).joinedload(Job.business_head),
            joinedload(Candidate.assessment),
            joinedload(Candidate.sourced_by),
            joinedload(Candidate.assigned_to),
        )
        .join(Candidate.job)
        .order_by(Job.account_manager_id, Job.client_name, Candidate.full_name)  # account_manager_id = business_head FK
    )

    if business_head_id:
        q = q.filter(Job.account_manager_id == business_head_id)
    if status:
        q = q.filter(Candidate.status == status)

    rows = []
    for c in q.all():
        j = c.job
        a = c.assessment

        rows.append({
            # JD Info
            "business_head":        j.business_head.name if j and j.business_head else "—",
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


@router.get("/pod-report")
def pod_report(
    db: Session = Depends(get_db),
    _=Depends(require_roles(*ALLOWED)),
):
    """Full pod-level data for the multi-sheet Excel pod report."""
    today = date.today()
    d1    = today - timedelta(days=1)
    d2    = today - timedelta(days=2)

    # ── 1. All jobs ──────────────────────────────────────────────────────────
    jobs = db.query(Job).options(
        joinedload(Job.assigned_sourcer),
        joinedload(Job.assigned_caller),
        joinedload(Job.delivery_lead),
        joinedload(Job.business_head),
    ).filter(Job.status != JobStatus.closed).order_by(Job.client_name, Job.role_title).all()

    # Lookup: user_id → user row (for sourcer/caller arrays)
    all_users = {u.id: u for u in db.query(User).filter(User.is_active == True).all()}

    def _names(ids_json) -> list[str]:
        ids = json.loads(ids_json or '[]') if isinstance(ids_json, str) else []
        return [all_users[i].name for i in ids if i in all_users]

    # ── 2. Candidate pipeline counts per job ─────────────────────────────────
    # Status buckets
    SUB_STATUSES = {
        CandidateStatus.submitted_to_client, CandidateStatus.interview_stage,
        CandidateStatus.offer_rolled_out, CandidateStatus.joined,
        CandidateStatus.backed_out,
    }
    L1_STAGES = {
        InterviewStage.l1_scheduled, InterviewStage.l1_feedback_pending,
        InterviewStage.l1_cleared, InterviewStage.l1_rejected,
        InterviewStage.l2_scheduled, InterviewStage.l2_feedback_pending,
        InterviewStage.l2_cleared, InterviewStage.l2_rejected,
        InterviewStage.final_scheduled, InterviewStage.final_feedback_pending,
        InterviewStage.final_cleared, InterviewStage.final_rejected,
        InterviewStage.offer_rolled_out, InterviewStage.offer_accepted,
        InterviewStage.offer_declined, InterviewStage.joined, InterviewStage.no_show,
    }
    L2_STAGES = {
        InterviewStage.l2_scheduled, InterviewStage.l2_feedback_pending,
        InterviewStage.l2_cleared, InterviewStage.l2_rejected,
        InterviewStage.final_scheduled, InterviewStage.final_feedback_pending,
        InterviewStage.final_cleared, InterviewStage.final_rejected,
        InterviewStage.offer_rolled_out, InterviewStage.offer_accepted,
        InterviewStage.offer_declined, InterviewStage.joined,
    }
    SEL_STAGES = {InterviewStage.joined, InterviewStage.final_cleared, InterviewStage.offer_accepted}

    def _date_eq(dt, d: date) -> bool:
        if dt is None:
            return False
        if isinstance(dt, datetime):
            return dt.date() == d
        return dt == d

    # Load all candidates with their submissions
    all_cands = db.query(Candidate).options(
        joinedload(Candidate.sourced_by),
        joinedload(Candidate.assigned_to),
        joinedload(Candidate.assessment),
        joinedload(Candidate.submission),
        joinedload(Candidate.job),
    ).all()

    cands_by_job: dict[int, list] = {}
    for c in all_cands:
        cands_by_job.setdefault(c.job_id, []).append(c)

    # Timeline entries by submission for date-based counting
    all_timelines = db.query(SubmissionTimeline).filter(
        SubmissionTimeline.stage == 'submitted'
    ).all()
    timelines_by_sub: dict[int, list] = {}
    for t in all_timelines:
        timelines_by_sub.setdefault(t.submission_id, []).append(t)

    def _sub_count_on(job_id: int, d: date) -> int:
        count = 0
        for c in cands_by_job.get(job_id, []):
            sub = c.submission
            if not sub:
                continue
            for t in timelines_by_sub.get(sub.id, []):
                if _date_eq(t.created_at, d):
                    count += 1
        return count

    def _pipeline(job_id: int) -> dict:
        cands = cands_by_job.get(job_id, [])
        total_sourced  = len(cands)
        validated      = sum(1 for c in cands if c.status == CandidateStatus.validated)
        submitted      = sum(1 for c in cands if c.status in SUB_STATUSES or (c.submission is not None))
        l1             = sum(1 for c in cands if c.submission and c.submission.current_stage in L1_STAGES)
        l2             = sum(1 for c in cands if c.submission and c.submission.current_stage in L2_STAGES)
        selections     = sum(1 for c in cands if c.submission and c.submission.current_stage in SEL_STAGES)
        rejections     = sum(1 for c in cands if c.status == CandidateStatus.rejected)
        return {
            "total_sourced": total_sourced,
            "validated": validated,
            "total_submitted": submitted,
            "l1_count": l1,
            "l2_count": l2,
            "selections": selections,
            "rejections": rejections,
            "today_subs": _sub_count_on(job_id, today),
            "d1_subs":    _sub_count_on(job_id, d1),
            "d2_subs":    _sub_count_on(job_id, d2),
        }

    def _fmtdate(v) -> str:
        if v is None:
            return ""
        if hasattr(v, "date"):
            return v.date().isoformat()
        return str(v)

    jobs_data = []
    for j in jobs:
        pipe = _pipeline(j.id)
        created_by = all_users.get(j.created_by_id)
        jobs_data.append({
            "id":             j.id,
            "client_name":    j.client_name,
            "client_job_id":  j.client_job_id or "",
            "demand_type":    j.demand_type or "",
            "demand_exclusivity": j.demand_exclusivity or "",
            "role_title":     j.role_title,
            "headcount":      j.headcount,
            "skill_stack":    j.skill_stack or "",
            "status":         j.status.value,
            "created_at":     _fmtdate(j.created_at),
            "deadline":       _fmtdate(j.deadline),
            "sourcing_target": j.sourcing_target,
            "kam_name":       created_by.name if created_by else "",
            "dl_name":        j.delivery_lead.name if j.delivery_lead else "",
            "bh_name":        j.business_head.name if j.business_head else "",
            "sourcer_names":  _names(j.sourcer_ids),
            "caller_names":   _names(j.caller_ids),
            **pipe,
        })

    # ── 3. Per-recruiter candidate data ─────────────────────────────────────
    recruiters = [u for u in all_users.values() if u.role == UserRole.recruiter]
    recruiters.sort(key=lambda u: u.name)

    def _safe(v, suffix=""):
        if v is None or v == "":
            return "—"
        return f"{v}{suffix}"

    def _cand_row(c: Candidate) -> dict:
        a = c.assessment
        j = c.job
        sub = c.submission
        return {
            "sourcing_date":      _safe(c.sourcing_date),
            "pool_verified":      "Yes" if c.pool_verified else "No",
            "full_name":          c.full_name or "—",
            "mobile":             c.mobile or "—",
            "email":              c.email or "—",
            "linkedin_url":       c.linkedin_url or "—",
            "education":          c.education or "—",
            "city":               c.city or "—",
            "naukri_active":      "Yes" if c.naukri_active else "No",
            "exp_range":          c.exp_range or "—",
            "current_company":    c.current_company or _safe(a and a.last_company),
            "skills":             (a.primary_skill_stack or c.skills) if a else (c.skills or "—"),
            "immediate_joiner":   "Yes" if c.immediate_joiner else "No",
            "status":             c.status.value.replace("_"," ").title() if c.status else "—",
            "lead_source":        c.lead_source or "—",
            # Job context
            "demand_id":          j.client_job_id or str(j.id) if j else "—",
            "job_client":         j.client_name if j else "—",
            "job_title":          j.role_title if j else "—",
            # Assessment
            "total_exp":          _safe(a and a.total_exp, " yrs") if a else "—",
            "relevant_exp":       _safe(a and a.relevant_exp, " yrs") if a else "—",
            "current_ctc":        _safe(a and a.current_ctc, " LPA") if a else "—",
            "expected_ctc":       _safe(a and a.expected_ctc, " LPA") if a else "—",
            "hike_pct":           _safe(a and a.hike_pct, "%") if a else "—",
            "notice_period_weeks":_safe(a and a.notice_period_weeks, " wks") if a else "—",
            "last_working_day":   _safe(a and a.last_working_day) if a else "—",
            "deploying_client":   _safe(a and a.deploying_client) if a else "—",
            "reason_for_change":  _safe(a and a.reason_for_change) if a else "—",
            "offers_in_hand":     _safe(a and a.offers_in_hand) if a else "—",
            "comm_score":         _safe(a and a.comm_score) if a else "—",
            "tech_score":         _safe(a and a.tech_score) if a else "—",
            "soft_skill_score":   _safe(a and a.soft_skill_score) if a else "—",
            "overall_score":      _safe(a and a.overall_score) if a else "—",
            "auto_recommendation":_safe(a and a.auto_recommendation) if a else "—",
            "pass_to_validation": _safe(a and a.pass_to_validation) if a else "—",
            "red_flags":          (a.red_flags or "[]") if a else "[]",
            "caller_notes":       _safe(a and a.caller_notes) if a else "—",
            # Submission tracking
            "dl_validated":       c.status in (CandidateStatus.validated,),
            "submitted_to_client":c.submission is not None,
            "current_stage":      sub.current_stage.value if sub and sub.current_stage else "—",
        }

    recruiters_data = []
    for r in recruiters:
        dl = all_users.get(r.pod_lead_id)
        my_cands = [c for c in all_cands if c.sourced_by_id == r.id or c.assigned_to_id == r.id]
        my_cands.sort(key=lambda c: (c.sourcing_date or "") if c.sourcing_date else "", reverse=True)
        # Assigned jobs (from sourcer_ids / caller_ids)
        my_job_ids = [j.id for j in jobs if
                      r.id in (json.loads(j.sourcer_ids or '[]') if isinstance(j.sourcer_ids, str) else []) or
                      r.id in (json.loads(j.caller_ids or '[]') if isinstance(j.caller_ids, str) else [])]
        my_jobs = [jd for jd in jobs_data if jd["id"] in my_job_ids]
        recruiters_data.append({
            "id":             r.id,
            "name":           r.name,
            "recruiter_type": r.recruiter_type.value if r.recruiter_type else "both",
            "dl_name":        dl.name if dl else "",
            "sourcing_load":  sum(1 for j in jobs if r.id in (json.loads(j.sourcer_ids or '[]') if isinstance(j.sourcer_ids, str) else [])),
            "calling_load":   len([c for c in all_cands if c.assigned_to_id == r.id
                                   and c.status not in (CandidateStatus.joined, CandidateStatus.backed_out, CandidateStatus.rejected)]),
            "assigned_jobs":  my_jobs,
            "candidates":     [_cand_row(c) for c in my_cands],
        })

    # ── 4. DL teams ──────────────────────────────────────────────────────────
    dls = [u for u in all_users.values() if u.role == UserRole.delivery_lead]
    dl_teams = []
    for dl in sorted(dls, key=lambda u: u.name):
        team = [u for u in all_users.values() if u.pod_lead_id == dl.id]
        dl_demands = [jd for jd in jobs_data if jd["dl_name"] == dl.name]
        dl_teams.append({
            "dl_name":    dl.name,
            "recruiters": [u.name for u in sorted(team, key=lambda u: u.name)],
            "demands":    dl_demands,
        })

    # ── 5. KAM accountability per demand ─────────────────────────────────────
    kams = [u for u in all_users.values()
            if u.role == UserRole.kam or u.secondary_role == "kam"]
    kam_data = []
    for kam in sorted(kams, key=lambda u: u.name):
        kam_demands = [jd for jd in jobs_data if jd["kam_name"] == kam.name]
        kam_data.append({
            "kam_name": kam.name,
            "demands":  kam_demands,
        })

    # ── 6. Pod summary ───────────────────────────────────────────────────────
    pod_stats = {
        "report_date":        today.isoformat(),
        "total_demands":      len(jobs_data),
        "total_sourced":      sum(jd["total_sourced"] for jd in jobs_data),
        "total_validated":    sum(jd["validated"] for jd in jobs_data),
        "total_submitted":    sum(jd["total_submitted"] for jd in jobs_data),
        "total_l1":           sum(jd["l1_count"] for jd in jobs_data),
        "total_l2":           sum(jd["l2_count"] for jd in jobs_data),
        "total_selections":   sum(jd["selections"] for jd in jobs_data),
        "today_subs":         sum(jd["today_subs"] for jd in jobs_data),
        "recruiters_count":   len(recruiters),
    }

    return {
        "jobs":       jobs_data,
        "recruiters": recruiters_data,
        "dl_teams":   dl_teams,
        "kam_data":   kam_data,
        "pod_stats":  pod_stats,
    }
