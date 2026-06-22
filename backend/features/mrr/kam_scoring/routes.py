"""KAM Interviews Suggestion — AI resume-vs-JD scoring endpoints.

Read existing candidate/job/OL data; write only to the ai_* tables.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import get_current_user
from infra.models import (
    AiCandidateReject,
    AiCandidateScore,
    AiJdRubric,
    AiScoringRun,
    Job,
)
from infra.s3 import to_viewable_url

from . import service
from .schema import DecisionIn, JdOverrideIn, RunIn

router = APIRouter(prefix="/kam-scoring", tags=["kam-scoring"])

ALLOWED_ROLES = {"admin", "coo", "ceo", "ops_head", "bh", "kam", "delivery_lead"}


def _role(user) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _require(user):
    if _role(user) not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Not allowed.")


def _loads(s, default):
    if not s:
        return default
    try:
        return json.loads(s)
    except Exception:
        return default


# ── Run + live status ────────────────────────────────────────────────────────

@router.post("/run")
def run_scoring(payload: RunIn | None = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require(current_user)
    snapshot = {"id": current_user.id, "role": _role(current_user), "pod_id": current_user.pod_id}
    cand_ids = payload.candidate_ids if payload else None
    try:
        return service.start_run(current_user.id, snapshot, cand_ids)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/stop")
def stop_scoring(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require(current_user)
    run = (
        db.query(AiScoringRun)
        .filter(AiScoringRun.kam_user_id == current_user.id, AiScoringRun.status == "running")
        .order_by(AiScoringRun.id.desc())
        .first()
    )
    if not run:
        return {"ok": True, "stopped": False}
    run.status = "cancelled"
    run.finished_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "stopped": True}


@router.get("/status")
def run_status(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require(current_user)
    run = (
        db.query(AiScoringRun)
        .filter(AiScoringRun.kam_user_id == current_user.id)
        .order_by(AiScoringRun.id.desc())
        .first()
    )
    if not run:
        return {"status": "idle", "total": 0, "completed": 0}
    return {
        "status": run.status,
        "total": run.total,
        "completed": run.completed,
        "error": run.error,
        "started_at": run.started_at.replace(tzinfo=timezone.utc).isoformat() if run.started_at else None,
    }


# ── Results (ranked candidates + rubric, for live table / CSV / PDF / email) ──

@router.get("/results")
def results(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Full in-bucket (0-3/4-5/6-7, OL step 7) candidate universe for the caller's
    scope — the same population as KAM Interviews — LEFT-merged with any AI scores.
    Unscored candidates appear with blank scores so KAMs see everything here."""
    _require(current_user)
    meta_rows = service.scoped_candidate_rows(db, current_user)
    if not meta_rows:
        return {"rows": [], "demands": {}, "generated_at": datetime.now(timezone.utc).isoformat()}

    # the universe = those currently at OL step 7 within an in-suggestion bucket
    buckets = service._ol_step7_buckets(meta_rows)
    universe = [m for m in meta_rows if m.candidate_id in buckets]
    if not universe:
        return {"rows": [], "demands": {}, "generated_at": datetime.now(timezone.utc).isoformat()}

    job_ids = list({m.job_id for m in universe})
    cand_ids = [m.candidate_id for m in universe]

    scores = {s.candidate_id: s for s in db.query(AiCandidateScore).filter(AiCandidateScore.candidate_id.in_(cand_ids)).all()}
    rejects = {(r.candidate_id, r.job_id) for r in db.query(AiCandidateReject.candidate_id, AiCandidateReject.job_id).filter(AiCandidateReject.candidate_id.in_(cand_ids)).all()}
    rubrics = {rb.job_id: rb for rb in db.query(AiJdRubric).filter(AiJdRubric.job_id.in_(job_ids)).all()}
    jd_raw = {jid: raw for jid, raw in db.query(Job.id, Job.jd_raw_text).filter(Job.id.in_(job_ids)).all()}

    # demands map: per-demand JD presence + effective text (override → raw) + rubric
    demands = {}
    meta_by_job = {}
    for m in universe:
        meta_by_job.setdefault(m.job_id, m)
    for jid in job_ids:
        rb = rubrics.get(jid)
        m = meta_by_job.get(jid)
        if rb and rb.jd_is_override and (rb.jd_text_effective or "").strip():
            jd_eff = rb.jd_text_effective
        else:
            jd_eff = jd_raw.get(jid) or ""
        rubric = _loads(rb.rubric_json, {}) if rb else {}
        demands[str(jid)] = {
            "job_id": jid,
            "role_title": m.role_title if m else None,
            "client_name": m.client_name if m else None,
            "has_jd": bool((jd_eff or "").strip()),
            "jd_is_override": bool(rb.jd_is_override) if rb else False,
            "jd_effective": jd_eff or "",
            "rubric_status": rb.status if rb else None,
            "criteria": rubric.get("criteria", []),
            "skills": _loads(rb.skills_json, []) if rb else [],
        }

    rows = []
    for m in universe:
        s = scores.get(m.candidate_id)
        bucket, weight = buckets[m.candidate_id]
        has_jd = demands[str(m.job_id)]["has_jd"]
        if s:
            status = s.status
            decision = s.decision
        else:
            status = "unscored" if has_jd else "no_jd"
            decision = "reject" if (m.candidate_id, m.job_id) in rejects else "pending"
        rows.append({
            "candidate_id": m.candidate_id,
            "job_id": m.job_id,
            "full_name": m.full_name,
            "email": m.email,
            "role_title": m.role_title,
            "client_name": m.client_name,
            "kam_name": m.kam_name,
            "bh_name": m.bh_name,
            "bucket": (s.bucket if s and s.bucket else bucket),
            "wait_weight": (s.wait_weight if s and s.wait_weight else weight),
            "overall_score": s.overall_score if s else None,
            "rank_score": s.rank_score if s else None,
            "criteria_scores": _loads(s.criteria_scores_json, []) if s else [],
            "skill_assessments": _loads(s.skill_assessments_json, []) if s else [],
            "extracted": _loads(s.extracted_json, {}) if s else {},
            "decision": decision,
            "status": status,
            "resume_url": to_viewable_url(m.resume_data or m.resume, candidate_id=m.candidate_id),
            "scored_at": s.scored_at.replace(tzinfo=timezone.utc).isoformat() if (s and s.scored_at) else None,
        })

    # scored first (rank_score desc), then unscored, then no_jd
    order = {"scored": 3, "unscored": 2, "no_resume": 1, "error": 1, "no_jd": 0}
    rows.sort(key=lambda x: (order.get(x["status"], 0), x["rank_score"] or 0), reverse=True)
    return {"rows": rows, "demands": demands, "generated_at": datetime.now(timezone.utc).isoformat()}


# ── KAM-provided JD override (never touches the jobs table) ───────────────────

@router.post("/jd")
def set_jd(payload: JdOverrideIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require(current_user)
    job = db.get(Job, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Demand not found.")
    text_ = (payload.jd_text or "").strip()
    if not text_:
        raise HTTPException(status_code=400, detail="JD text is required.")
    row = db.query(AiJdRubric).filter(AiJdRubric.job_id == payload.job_id).first()
    if not row:
        row = AiJdRubric(job_id=payload.job_id)
        db.add(row)
    row.jd_text_effective = text_
    row.jd_is_override = True
    row.jd_override_by = current_user.id
    row.jd_hash = None          # force rubric regeneration on next run
    row.rubric_json = None
    row.skills_json = None
    row.status = "pending"
    row.error = None
    db.commit()
    return {"ok": True, "job_id": payload.job_id, "status": "pending"}


# ── Select / Reject ──────────────────────────────────────────────────────────

@router.post("/decision")
def set_decision(payload: DecisionIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require(current_user)
    if payload.decision not in ("select", "reject", "pending"):
        raise HTTPException(status_code=400, detail="decision must be select|reject|pending")
    score = (
        db.query(AiCandidateScore)
        .filter(
            AiCandidateScore.candidate_id == payload.candidate_id,
            AiCandidateScore.job_id == payload.job_id,
        )
        .first()
    )
    if score:
        score.decision = payload.decision

    rej = (
        db.query(AiCandidateReject)
        .filter(
            AiCandidateReject.candidate_id == payload.candidate_id,
            AiCandidateReject.job_id == payload.job_id,
        )
        .first()
    )
    if payload.decision == "reject":
        if not rej:
            db.add(AiCandidateReject(
                candidate_id=payload.candidate_id,
                job_id=payload.job_id,
                rejected_by=current_user.id,
                reason=payload.reason,
            ))
    else:
        if rej:
            db.delete(rej)
    db.commit()
    return {"ok": True, "decision": payload.decision}


# ── PDF report cards (fpdf2) ─────────────────────────────────────────────────

def _latin(s) -> str:
    txt = str(s or "").encode("latin-1", "replace").decode("latin-1")
    return txt if txt.strip() else " "  # fpdf2 errors on empty multi_cell


@router.get("/report.pdf")
def report_pdf(
    candidate_ids: str = Query(..., description="comma-separated candidate ids"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require(current_user)
    try:
        ids = [int(x) for x in candidate_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid candidate_ids")
    if not ids:
        raise HTTPException(status_code=400, detail="candidate_ids required")

    # scope: only candidates the caller can see
    meta = {r.candidate_id: r for r in service.scoped_candidate_rows(db, current_user)}
    scores = (
        db.query(AiCandidateScore)
        .filter(AiCandidateScore.candidate_id.in_(ids))
        .all()
    )

    from fpdf import FPDF
    from fpdf.enums import XPos, YPos
    pdf = FPDF(format="A4")  # default unit = mm
    pdf.set_margins(15, 15, 15)
    pdf.set_auto_page_break(auto=True, margin=15)

    def mc(h, txt):  # multi_cell that resets X to the left margin each line
        pdf.multi_cell(0, h, _latin(txt), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    any_card = False
    for s in scores:
        m = meta.get(s.candidate_id)
        if not m or s.decision == "reject":
            continue
        any_card = True
        extracted = _loads(s.extracted_json, {})
        criteria = _loads(s.criteria_scores_json, [])
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        mc(8, m.full_name or extracted.get("candidate_name") or "Candidate")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(90, 90, 90)
        mc(5, f"{m.role_title or ''}  -  {m.client_name or ''}  -  Overall {s.overall_score if s.overall_score is not None else '-'} / 100")
        contact = "  ".join(filter(None, [extracted.get("email"), extracted.get("phone"),
                                          extracted.get("location"), extracted.get("experience_range")]))
        if contact:
            mc(5, contact)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)
        if extracted.get("summary"):
            pdf.set_font("Helvetica", "I", 10)
            mc(5, extracted["summary"])
            pdf.ln(1)
        pdf.set_font("Helvetica", "B", 12)
        mc(6, "Criteria Breakdown")
        for c in criteria:
            pdf.set_font("Helvetica", "B", 11)
            mc(5, f"{c.get('name', 'Criterion')}  -  {c.get('score', '-')}/100")
            if c.get("rationale"):
                pdf.set_font("Helvetica", "", 10)
                pdf.set_text_color(70, 70, 70)
                mc(5, c["rationale"])
                pdf.set_text_color(0, 0, 0)
            pdf.ln(1)

    if not any_card:
        pdf.add_page()
        pdf.set_font("Helvetica", "", 12)
        mc(6, "No scored candidates available for this selection.")

    data = bytes(pdf.output())
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="candidate-reports.pdf"'},
    )
