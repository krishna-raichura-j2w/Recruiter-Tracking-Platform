"""Client Email Generator — KAM / Admin only."""

from __future__ import annotations

import json
import logging

from core.ai_service import call_ai
from core.database import SessionLocal
from core.deps import get_current_user, require_roles
from fastapi import APIRouter, Depends, HTTPException
from infra.models import (
    Candidate,
    ClientEmail,
    Job,
    Submission,
    to_iso_utc,
)
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/client-emails", tags=["client_emails"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── helpers ───────────────────────────────────────────────────────────────────


def _candidate_context(c: Candidate) -> str:
    """Compact text block describing a candidate for the AI prompt."""
    name = c.full_name or f"{c.first_name or ''} {c.last_name or ''}".strip() or "Unknown"
    exp = c.total_experience or c.exp_range or "?"
    ctc_cur = f"{c.current_ctc} LPA" if c.current_ctc else "not disclosed"
    ctc_exp = f"{c.expected_ctc} LPA" if c.expected_ctc else "not disclosed"
    company = c.current_company or c.employer or "—"
    designation = c.designation or "—"
    loc = c.city or c.location or "—"
    skills = c.skills or ""
    resume = (c.resume_data or c.resume or "")[:3000]  # cap at 3 k chars
    return (
        f"Candidate: {name}\n"
        f"Current Role: {designation} at {company}\n"
        f"Experience: {exp} years\n"
        f"Location: {loc}\n"
        f"Current CTC: {ctc_cur} | Expected CTC: {ctc_exp}\n"
        f"Skills: {skills}\n"
        f"Resume excerpt:\n{resume}"
    )


def _build_prompt(job: Job, candidates: list[Candidate]) -> str:
    job_desc = (job.jd_summary or job.skill_stack or job.jd_raw_text or "")[:2000]
    candidates_text = "\n\n---\n\n".join(_candidate_context(c) for c in candidates)

    return f"""You are a senior technical recruiter drafting a professional candidate shortlist email to a client.

JOB DETAILS
Title: {job.role_title}
Client: {job.client_name}
Location: {job.location or 'Not specified'}
Experience required: {job.min_experience or '?'}–{job.max_experience or '?'} years
Salary range: {job.salary_range or 'Not specified'}
Job description / skills:
{job_desc}

CANDIDATES (total: {len(candidates)})
{candidates_text}

TASK
Return ONLY a valid JSON object (no markdown, no extra text) with this exact structure:
{{
  "subject": "Candidate Shortlist – [Role] for [Client]",
  "greeting": "Dear [Client] Hiring Team,",
  "intro": "2-3 sentence professional introduction about this shortlist",
  "skills": ["skill1", "skill2", "skill3", "skill4"],
  "candidates": [
    {{
      "name": "Full Name",
      "current_role": "Title at Company",
      "experience": "X years",
      "location": "City",
      "ctc_info": "Current: X LPA | Expected: Y LPA",
      "summary": "2-3 sentence suitability summary",
      "skill_analysis": {{
        "skill1": {{"has": true, "note": "Brief one-liner evidence"}},
        "skill2": {{"has": false, "note": "Brief one-liner reason"}}
      }}
    }}
  ],
  "closing": "Professional call-to-action closing paragraph"
}}

Rules:
- Extract 4-6 key skills from the JD for the skills array
- Every candidate must have skill_analysis for every skill in the skills array
- Keep notes concise (1 sentence each)
- Be accurate — only mark has:true if there is evidence in the resume/skills
- The subject, greeting, intro, closing must be professional and client-ready"""


def _render_plain(data: dict) -> str:
    """Render AI JSON as plain text — paste directly into Gmail / Outlook."""
    skills: list[str] = data.get("skills", [])
    candidates: list[dict] = data.get("candidates", [])

    lines: list[str] = []

    lines.append(data.get("greeting", ""))
    lines.append("")
    lines.append(data.get("intro", ""))

    for idx, cand in enumerate(candidates, 1):
        lines.append("")
        lines.append("")
        name = cand.get("name", "")
        lines.append(f"{idx}. {name.upper()}")

        role = cand.get("current_role", "")
        if role:
            lines.append(f"   Role: {role}")

        parts = []
        exp = cand.get("experience", "")
        loc = cand.get("location", "")
        if exp:
            parts.append(f"Experience: {exp} yrs")
        if loc:
            parts.append(f"Location: {loc}")
        if parts:
            lines.append(f"   {' | '.join(parts)}")

        ctc = cand.get("ctc_info", "")
        if ctc and ctc != "Not disclosed":
            lines.append(f"   CTC: {ctc}")

        lines.append("")
        lines.append("   Skills:")
        for skill in skills:
            analysis = (cand.get("skill_analysis") or {}).get(skill, {})
            has = analysis.get("has", False)
            note = analysis.get("note", "")
            icon = "✅" if has else "❌"
            lines.append(f"   {icon} {skill} - {note}")

        summary = cand.get("summary", "")
        if summary:
            lines.append("")
            lines.append(f"   Summary: {summary}")

    lines.append("")
    lines.append("")
    lines.append(data.get("closing", ""))
    lines.append("")
    lines.append("Best regards,")
    lines.append("J2W Recruitment Team")

    return "\n".join(lines)


# ── endpoints ─────────────────────────────────────────────────────────────────


@router.get("/jobs")
def list_kam_jobs(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "kam")),
):
    """Jobs the current KAM (or admin) manages, with submitted candidate counts."""
    from infra.models import CandidateStatus

    q = db.query(Job).filter(Job.status != "closed")
    if current_user.role.value == "kam":
        q = q.filter(Job.kam_id == current_user.id)

    jobs = q.order_by(Job.created_at.desc()).all()

    result = []
    for job in jobs:
        submitted_count = (
            db.query(Submission)
            .join(Candidate, Submission.candidate_id == Candidate.id)
            .filter(
                Submission.job_id == job.id,
                Candidate.status == CandidateStatus.submitted_to_client,
            )
            .count()
        )
        result.append({
            "id": job.id,
            "role_title": job.role_title,
            "client_name": job.client_name,
            "status": job.status.value if job.status else None,
            "submitted_count": submitted_count,
        })

    return result


@router.get("/job-candidates/{job_id}")
def get_job_candidates(
    job_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "kam")),
):
    """Candidates who have been submitted to client for a specific job."""
    from infra.models import CandidateStatus

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if current_user.role.value == "kam" and job.kam_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    rows = (
        db.query(Candidate, Submission)
        .join(Submission, Submission.candidate_id == Candidate.id)
        .filter(
            Submission.job_id == job_id,
            Candidate.status == CandidateStatus.submitted_to_client,
        )
        .all()
    )

    candidates = []
    for cand, sub in rows:
        name = cand.full_name or f"{cand.first_name or ''} {cand.last_name or ''}".strip()
        candidates.append({
            "id": cand.id,
            "name": name,
            "current_role": f"{cand.designation or ''} at {cand.current_company or cand.employer or ''}".strip(" at"),
            "experience": str(cand.total_experience or cand.exp_range or ""),
            "location": cand.city or cand.location or "",
            "ctc_info": (
                f"Current: {cand.current_ctc} LPA | Expected: {cand.expected_ctc} LPA"
                if cand.current_ctc or cand.expected_ctc else "Not disclosed"
            ),
            "submitted_at": to_iso_utc(sub.submitted_at),
        })

    job_info = {
        "id": job.id,
        "role_title": job.role_title,
        "client_name": job.client_name,
        "location": job.location or "",
        "skill_stack": job.skill_stack or "",
        "min_experience": job.min_experience,
        "max_experience": job.max_experience,
        "salary_range": job.salary_range or "",
    }

    return {"job": job_info, "candidates": candidates}


@router.post("/generate")
def generate_client_email(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "kam")),
):
    """
    Generate a candidate shortlist email using AI.

    Body: { job_id: int, candidate_ids: list[int] }
    """
    job_id: int = payload.get("job_id")
    candidate_ids: list[int] = payload.get("candidate_ids", [])

    if not job_id or not candidate_ids:
        raise HTTPException(status_code=400, detail="job_id and candidate_ids are required")

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if current_user.role.value == "kam" and job.kam_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    candidates = (
        db.query(Candidate)
        .filter(Candidate.id.in_(candidate_ids), Candidate.job_id == job_id)
        .all()
    )
    if not candidates:
        raise HTTPException(status_code=400, detail="No valid candidates found")

    prompt = _build_prompt(job, candidates)

    try:
        raw = call_ai(
            prompt=prompt,
            system_prompt=(
                "You are a professional recruiter assistant. "
                "Return ONLY valid JSON — no markdown fences, no extra text."
            ),
            max_tokens=3000,
        )
    except Exception as exc:
        logger.error(f"AI call failed: {exc}")
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")

    # Parse AI response
    try:
        # Strip possible markdown fences
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            cleaned = cleaned.rsplit("```", 1)[0]
        email_data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.error(f"AI returned non-JSON: {raw[:500]}")
        raise HTTPException(status_code=502, detail="AI returned invalid JSON")

    email_text = _render_plain(email_data)

    # Persist
    record = ClientEmail(
        job_id=job_id,
        created_by_id=current_user.id,
        subject=email_data.get("subject", ""),
        email_html=email_text,   # column reused for plain text
        email_json=raw,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "subject": email_data.get("subject", ""),
        "email_text": email_text,
        "email_data": email_data,
        "created_at": to_iso_utc(record.created_at),
    }


@router.get("/history/{job_id}")
def get_email_history(
    job_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "kam")),
):
    """Past generated emails for a job."""
    records = (
        db.query(ClientEmail)
        .filter(ClientEmail.job_id == job_id)
        .order_by(ClientEmail.created_at.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": r.id,
            "subject": r.subject,
            "created_at": to_iso_utc(r.created_at),
            "email_text": r.email_html,   # stored in email_html column
        }
        for r in records
    ]
