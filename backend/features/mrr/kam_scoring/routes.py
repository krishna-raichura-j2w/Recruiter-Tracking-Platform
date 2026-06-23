"""KAM Interviews Suggestion — AI resume-vs-JD scoring endpoints.

Read existing candidate/job/OL data; write only to the ai_* tables. Subjects are
identified by a unified string key:  mrr:{candidate_id}:{job_id}  |  ol:{ol_user_id}:{ol_job_posting_id}
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


def _score_key(s) -> str:
    return f"ol:{s.ol_user_id}:{s.ol_job_posting_id}" if s.source == "ol" else f"mrr:{s.candidate_id}:{s.job_id}"


def _parse_key(key: str):
    """('mrr', candidate_id, job_id) or ('ol', ol_user_id, ol_job_posting_id)."""
    p = key.split(":")
    return (p[0], int(p[1]), int(p[2]))


def _demand_key_str(m) -> str:
    return f"ol:{m.ol_job_posting_id}" if m.source == "ol" else f"mrr:{m.job_id}"


# ── Run + live status ────────────────────────────────────────────────────────

@router.post("/run")
def run_scoring(payload: RunIn | None = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require(current_user)
    snapshot = {"id": current_user.id, "role": _role(current_user), "pod_id": current_user.pod_id}
    keys = payload.keys if payload else None
    try:
        return service.start_run(current_user.id, snapshot, keys)
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
    scope — MRR candidates + OL-only candidates — LEFT-merged with any AI scores."""
    _require(current_user)
    meta_rows = service.scoped_candidate_rows(db, current_user)
    if not meta_rows:
        return {"rows": [], "demands": {}, "generated_at": datetime.now(timezone.utc).isoformat()}

    buckets = service._ol_step7_buckets(meta_rows)
    universe = [m for m in meta_rows if m.key in buckets]
    if not universe:
        return {"rows": [], "demands": {}, "generated_at": datetime.now(timezone.utc).isoformat()}

    mrr_cands = [m.candidate_id for m in universe if m.source == "mrr"]
    ol_uids = [m.ol_user_id for m in universe if m.source == "ol"]
    mrr_job_ids = {m.job_id for m in universe if m.source == "mrr"}
    ol_jp_ids = {m.ol_job_posting_id for m in universe if m.source == "ol"}

    # scores + rejects indexed by row key
    score_by_key, reject_keys = {}, set()
    if mrr_cands:
        for s in db.query(AiCandidateScore).filter(AiCandidateScore.source == "mrr", AiCandidateScore.candidate_id.in_(mrr_cands)).all():
            score_by_key[_score_key(s)] = s
        for r in db.query(AiCandidateReject).filter(AiCandidateReject.source == "mrr", AiCandidateReject.candidate_id.in_(mrr_cands)).all():
            reject_keys.add(f"mrr:{r.candidate_id}:{r.job_id}")
    if ol_uids:
        for s in db.query(AiCandidateScore).filter(AiCandidateScore.source == "ol", AiCandidateScore.ol_user_id.in_(ol_uids)).all():
            score_by_key[_score_key(s)] = s
        for r in db.query(AiCandidateReject).filter(AiCandidateReject.source == "ol", AiCandidateReject.ol_user_id.in_(ol_uids)).all():
            reject_keys.add(f"ol:{r.ol_user_id}:{r.ol_job_posting_id}")

    # rubrics indexed by demand key string
    rubric_by_demand = {}
    if mrr_job_ids:
        for rb in db.query(AiJdRubric).filter(AiJdRubric.source == "mrr", AiJdRubric.job_id.in_(list(mrr_job_ids))).all():
            rubric_by_demand[f"mrr:{rb.job_id}"] = rb
    if ol_jp_ids:
        for rb in db.query(AiJdRubric).filter(AiJdRubric.source == "ol", AiJdRubric.ol_job_posting_id.in_(list(ol_jp_ids))).all():
            rubric_by_demand[f"ol:{rb.ol_job_posting_id}"] = rb
    jd_raw = {jid: raw for jid, raw in db.query(Job.id, Job.jd_raw_text).filter(Job.id.in_(list(mrr_job_ids))).all()} if mrr_job_ids else {}

    # demands map keyed by demand key string
    demands, meta_by_demand = {}, {}
    for m in universe:
        meta_by_demand.setdefault(_demand_key_str(m), m)
    for dk, m in meta_by_demand.items():
        rb = rubric_by_demand.get(dk)
        if rb and rb.jd_is_override and (rb.jd_text_effective or "").strip():
            jd_eff = rb.jd_text_effective
        elif m.source == "ol":
            jd_eff = m.jd_text or ""
        else:
            jd_eff = jd_raw.get(m.job_id) or ""
        rubric = _loads(rb.rubric_json, {}) if rb else {}
        demands[dk] = {
            "demand_key": dk,
            "source": m.source,
            "job_id": m.job_id,
            "ol_job_posting_id": m.ol_job_posting_id,
            "role_title": m.role_title,
            "client_name": m.client_name,
            "has_jd": bool((jd_eff or "").strip()),
            "jd_is_override": bool(rb.jd_is_override) if rb else False,
            "jd_effective": jd_eff or "",
            "rubric_status": rb.status if rb else None,
            "criteria": rubric.get("criteria", []),
            "skills": _loads(rb.skills_json, []) if rb else [],
        }

    rows = []
    for m in universe:
        dk = _demand_key_str(m)
        s = score_by_key.get(m.key)
        bucket, weight = buckets[m.key]
        has_jd = demands[dk]["has_jd"]
        if s:
            status, decision = s.status, s.decision
        else:
            status = "unscored" if has_jd else "no_jd"
            decision = "reject" if m.key in reject_keys else "pending"
        resume_url = (service.ol_resume_url(m.ol_cp_id, m.ol_resume_filename) if m.source == "ol"
                      else to_viewable_url(m.resume_data or m.resume, candidate_id=m.candidate_id))
        rows.append({
            "key": m.key,
            "source": m.source,
            "is_ol_only": m.source == "ol",
            "demand_key": dk,
            "candidate_id": m.candidate_id,
            "job_id": m.job_id,
            "ol_user_id": m.ol_user_id,
            "ol_job_posting_id": m.ol_job_posting_id,
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
            "resume_url": resume_url,
            "scored_at": s.scored_at.replace(tzinfo=timezone.utc).isoformat() if (s and s.scored_at) else None,
        })

    order = {"scored": 3, "unscored": 2, "no_resume": 1, "error": 1, "no_jd": 0}
    rows.sort(key=lambda x: (order.get(x["status"], 0), x["rank_score"] or 0), reverse=True)
    return {"rows": rows, "demands": demands, "generated_at": datetime.now(timezone.utc).isoformat()}


# ── KAM-provided JD override (never touches the jobs table) ───────────────────

@router.post("/jd")
def set_jd(payload: JdOverrideIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require(current_user)
    text_ = (payload.jd_text or "").strip()
    if not text_:
        raise HTTPException(status_code=400, detail="JD text is required.")
    parts = payload.demand_key.split(":")
    src, demand_id = parts[0], int(parts[1])
    if src == "ol":
        row = db.query(AiJdRubric).filter(AiJdRubric.source == "ol", AiJdRubric.ol_job_posting_id == demand_id).first()
        if not row:
            row = AiJdRubric(source="ol", ol_job_posting_id=demand_id)
            db.add(row)
    else:
        if not db.get(Job, demand_id):
            raise HTTPException(status_code=404, detail="Demand not found.")
        row = db.query(AiJdRubric).filter(AiJdRubric.source == "mrr", AiJdRubric.job_id == demand_id).first()
        if not row:
            row = AiJdRubric(source="mrr", job_id=demand_id)
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
    return {"ok": True, "demand_key": payload.demand_key, "status": "pending"}


# ── Select / Reject ──────────────────────────────────────────────────────────

@router.post("/decision")
def set_decision(payload: DecisionIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require(current_user)
    if payload.decision not in ("select", "reject", "pending"):
        raise HTTPException(status_code=400, detail="decision must be select|reject|pending")
    src, a, b = _parse_key(payload.key)
    if src == "ol":
        score = db.query(AiCandidateScore).filter(AiCandidateScore.source == "ol", AiCandidateScore.ol_user_id == a, AiCandidateScore.ol_job_posting_id == b).first()
        rej = db.query(AiCandidateReject).filter(AiCandidateReject.source == "ol", AiCandidateReject.ol_user_id == a, AiCandidateReject.ol_job_posting_id == b).first()
        new_rej = lambda: AiCandidateReject(source="ol", ol_user_id=a, ol_job_posting_id=b, rejected_by=current_user.id, reason=payload.reason)
    else:
        score = db.query(AiCandidateScore).filter(AiCandidateScore.source == "mrr", AiCandidateScore.candidate_id == a, AiCandidateScore.job_id == b).first()
        rej = db.query(AiCandidateReject).filter(AiCandidateReject.source == "mrr", AiCandidateReject.candidate_id == a, AiCandidateReject.job_id == b).first()
        new_rej = lambda: AiCandidateReject(source="mrr", candidate_id=a, job_id=b, rejected_by=current_user.id, reason=payload.reason)

    if score:
        score.decision = payload.decision
    if payload.decision == "reject":
        if not rej:
            db.add(new_rej())
    elif rej:
        db.delete(rej)
    db.commit()
    return {"ok": True, "decision": payload.decision}


# ── PDF report cards (fpdf2) ─────────────────────────────────────────────────

def _latin(s) -> str:
    txt = str(s or "").encode("latin-1", "replace").decode("latin-1")
    return txt if txt.strip() else " "  # fpdf2 errors on empty multi_cell


@router.get("/report.pdf")
def report_pdf(
    keys: str = Query(..., description="comma-separated row keys"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require(current_user)
    key_list = [k.strip() for k in keys.split(",") if k.strip()]
    if not key_list:
        raise HTTPException(status_code=400, detail="keys required")

    meta = {m.key: m for m in service.scoped_candidate_rows(db, current_user)}  # scope guard
    mrr_cands = [int(k.split(":")[1]) for k in key_list if k.startswith("mrr:")]
    ol_uids = [int(k.split(":")[1]) for k in key_list if k.startswith("ol:")]
    score_by_key = {}
    if mrr_cands:
        for s in db.query(AiCandidateScore).filter(AiCandidateScore.source == "mrr", AiCandidateScore.candidate_id.in_(mrr_cands)).all():
            score_by_key[_score_key(s)] = s
    if ol_uids:
        for s in db.query(AiCandidateScore).filter(AiCandidateScore.source == "ol", AiCandidateScore.ol_user_id.in_(ol_uids)).all():
            score_by_key[_score_key(s)] = s

    from fpdf import FPDF
    from fpdf.enums import XPos, YPos
    pdf = FPDF(format="A4")
    pdf.set_margins(15, 15, 15)
    pdf.set_auto_page_break(auto=True, margin=15)

    def mc(h, txt):
        pdf.multi_cell(0, h, _latin(txt), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    any_card = False
    for k in key_list:
        m = meta.get(k)
        s = score_by_key.get(k)
        if not m or not s or s.decision == "reject":
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
