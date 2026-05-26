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


def _render_html(data: dict) -> str:
    """Turn the AI JSON into a styled HTML email body."""
    skills: list[str] = data.get("skills", [])
    candidates: list[dict] = data.get("candidates", [])

    # ── skills-matrix rows ───────────────────────────────────────────────────
    header_cells = "".join(
        f'<th style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;'
        f'font-weight:600;font-size:12px;color:#374151;white-space:nowrap">{s}</th>'
        for s in skills
    )
    header_cells += (
        '<th style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;'
        'font-weight:600;font-size:12px;color:#374151;min-width:180px">Overall Summary</th>'
    )

    candidate_rows = ""
    for idx, cand in enumerate(candidates):
        bg = "#ffffff" if idx % 2 == 0 else "#f9fafb"
        skill_cells = ""
        for s in skills:
            analysis = (cand.get("skill_analysis") or {}).get(s, {})
            has = analysis.get("has", False)
            note = analysis.get("note", "—")
            icon = "✅" if has else "❌"
            skill_cells += (
                f'<td style="padding:8px 12px;border:1px solid #e2e8f0;background:{bg};'
                f'font-size:12px;vertical-align:top">'
                f'<span style="font-size:14px">{icon}</span><br>'
                f'<span style="color:#6b7280;font-size:11px">{note}</span></td>'
            )
        summary_cell = (
            f'<td style="padding:8px 12px;border:1px solid #e2e8f0;background:{bg};'
            f'font-size:12px;color:#374151;vertical-align:top">{cand.get("summary","")}</td>'
        )

        candidate_rows += (
            f'<tr>'
            f'<td style="padding:8px 12px;border:1px solid #e2e8f0;background:{bg};'
            f'font-weight:600;font-size:12px;color:#1e293b;white-space:nowrap;vertical-align:top">'
            f'{cand.get("name","")}</td>'
            f'<td style="padding:8px 12px;border:1px solid #e2e8f0;background:{bg};'
            f'font-size:12px;color:#374151;white-space:nowrap;vertical-align:top">'
            f'{cand.get("current_role","")}</td>'
            f'<td style="padding:8px 12px;border:1px solid #e2e8f0;background:{bg};'
            f'font-size:12px;color:#374151;white-space:nowrap;vertical-align:top">'
            f'{cand.get("experience","")}</td>'
            f'<td style="padding:8px 12px;border:1px solid #e2e8f0;background:{bg};'
            f'font-size:12px;color:#374151;white-space:nowrap;vertical-align:top">'
            f'{cand.get("location","")}</td>'
            f'<td style="padding:8px 12px;border:1px solid #e2e8f0;background:{bg};'
            f'font-size:12px;color:#374151;white-space:nowrap;vertical-align:top">'
            f'{cand.get("ctc_info","")}</td>'
            f'{skill_cells}{summary_cell}'
            f'</tr>'
        )

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;margin:0;padding:24px">
<div style="max-width:900px;margin:0 auto;background:#ffffff;border-radius:12px;
     box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a8a,#3b82f6);padding:28px 36px">
    <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0 0 4px">Candidate Shortlist</p>
    <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700">
      {data.get("subject","Candidate Shortlist")}
    </h1>
  </div>

  <!-- Body -->
  <div style="padding:28px 36px">
    <p style="font-size:15px;color:#374151;margin:0 0 12px">{data.get("greeting","")}</p>
    <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 24px">
      {data.get("intro","")}
    </p>

    <!-- Skills Matrix Table -->
    <div style="overflow-x:auto;margin-bottom:24px">
      <table style="border-collapse:collapse;width:100%;min-width:700px">
        <thead>
          <tr>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;background:#1e3a8a;
              color:#ffffff;font-size:12px;font-weight:600;text-align:left">Candidate</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;background:#1e3a8a;
              color:#ffffff;font-size:12px;font-weight:600;white-space:nowrap">Current Role</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;background:#1e3a8a;
              color:#ffffff;font-size:12px;font-weight:600">Exp.</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;background:#1e3a8a;
              color:#ffffff;font-size:12px;font-weight:600">Location</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;background:#1e3a8a;
              color:#ffffff;font-size:12px;font-weight:600;white-space:nowrap">CTC</th>
            {header_cells}
          </tr>
        </thead>
        <tbody>
          {candidate_rows}
        </tbody>
      </table>
    </div>

    <p style="font-size:14px;color:#4b5563;line-height:1.7;margin:0 0 28px">
      {data.get("closing","")}
    </p>

    <!-- Signature -->
    <div style="border-top:1px solid #e2e8f0;padding-top:18px;margin-top:8px">
      <p style="font-size:13px;color:#6b7280;margin:0">Best regards,</p>
      <p style="font-size:13px;font-weight:700;color:#1e293b;margin:2px 0">J2W Recruitment Team</p>
    </div>
  </div>
</div>
</body>
</html>"""


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

    html = _render_html(email_data)

    # Persist
    record = ClientEmail(
        job_id=job_id,
        created_by_id=current_user.id,
        subject=email_data.get("subject", ""),
        email_html=html,
        email_json=raw,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "subject": email_data.get("subject", ""),
        "email_html": html,
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
            "email_html": r.email_html,
        }
        for r in records
    ]
