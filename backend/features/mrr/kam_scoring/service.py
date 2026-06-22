"""AI resume-vs-JD scoring for the KAM Interviews Suggestion section.

Ports the rubric / resume-scoring / skill-matrix approach from the reference
`ai-scoring-tool` onto our Azure OpenAI + S3 + Postgres stack. Fully additive:
reads existing candidate/job data, writes only to the ai_* tables.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session, aliased

from core.database import SessionLocal
from infra.models import (
    AiCandidateReject,
    AiCandidateScore,
    AiJdRubric,
    AiScoringRun,
    Candidate,
    Job,
    User,
)
from infra.s3 import get_object_bytes, resolve_resume_key
# reuse the existing PDF/DOCX text extractors
from features.mrr.resume_extract.service import _docx_to_text, _pdf_to_text

# Pace between candidate LLM scorings to spare the gpt-4o-mini endpoint.
SLEEP_BETWEEN_CANDIDATES = 2

# Aging bucket → wait weight (higher = waited longer = more urgent).
BUCKET_WEIGHT = {"d0_3": 1, "d4_5": 2, "d6_7": 3}
IN_BUCKETS = set(BUCKET_WEIGHT)  # suggestion covers 0-3 / 4-5 / 6-7 only

# ── Prompts (ported verbatim from ai-scoring-tool, JSON-mode) ────────────────

RUBRIC_PROMPT = """You are an expert technical recruiter. Read a job description and extract a clean, structured scoring rubric.
Return STRICT JSON with this shape:
{
  "title": "concise job title",
  "summary": "1-2 sentence summary of the role",
  "criteria": [
    { "name": "short criterion name", "weight": <integer 0-100>, "description": "what a strong candidate looks like for this" }
  ]
}
Rules:
- 4 to 7 criteria covering skills, experience, domain, education and soft skills as relevant.
- Weights MUST be integers that sum to exactly 100.
- Keep names short (2-4 words)."""

SKILLS_PROMPT = """You are an expert technical recruiter. From a job description, extract the concrete skills used to rank candidates, and classify each as PRIMARY or SECONDARY.
Return STRICT JSON:
{
  "skills": [
    { "name": "short skill name (2-4 words)", "tier": "primary | secondary", "description": "what evidence in a resume satisfies this skill" }
  ]
}
Rules:
- 5 to 12 skills. Focus on hard requirements (technologies, tools, domains, concrete competencies), not generic soft skills unless the role clearly demands them.
- PRIMARY = core, non-negotiable must-haves the role centers on. SECONDARY = supporting / nice-to-have / lower-weight skills.
- List PRIMARY skills before SECONDARY ones. Keep names short and use them consistently."""

SCORE_PROMPT = """You are an expert recruiter scoring a candidate's resume against a job's rubric.
Return STRICT JSON:
{
  "candidate_name": "full name or null",
  "email": "email or null",
  "phone": "phone or null",
  "location": "city, country or null",
  "education": "highest/most relevant degree + institution or null",
  "experience_range": "e.g. '5-7 years' or null",
  "current_company": "current employer or null",
  "relevant_skills": ["skill", ...],
  "criteria_scores": [
    { "name": "<must match a rubric criterion name>", "score": <0-100>, "rationale": "1-2 sentences" }
  ],
  "overall_score": <0-100 weighted by the rubric weights>,
  "summary": "2-3 sentence evaluation of fit"
}
Score honestly. If information is missing, score conservatively and say so in the rationale."""

ASSESS_PROMPT = """You assess a candidate's resume against a fixed list of skills.
Return STRICT JSON:
{
  "assessments": [
    { "skill": "<must exactly match a provided skill name>", "statement": "crisp evidence fragment", "score": <0-100> }
  ]
}
Rules:
- Return exactly one assessment for EVERY provided skill, using the same skill name.
- Base statements only on the resume.
- STATEMENT STYLE: short and crisp, max ~12 words. State the evidence directly as a fragment — do NOT start with "The candidate", "Has", or "Demonstrates". Examples: "7 yrs Node.js building payment APIs at Acme." / "No evidence in resume."
- If there is no evidence, statement = "No evidence in resume." and score low."""


# ── Azure OpenAI ─────────────────────────────────────────────────────────────

def _azure_json(system: str, user: str) -> tuple[dict, str]:
    """One JSON-mode chat completion against Azure OpenAI. Returns (parsed, model)."""
    from openai import AzureOpenAI
    client = AzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_version=os.getenv("AZURE_API_VERSION"),
    )
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    resp = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content or "{}"), deployment


def _sha(s: str | bytes) -> str:
    if isinstance(s, str):
        s = s.encode("utf-8", "ignore")
    return hashlib.sha256(s).hexdigest()


def _normalize_rubric(data: dict) -> dict:
    criteria = data.get("criteria") if isinstance(data, dict) else None
    criteria = criteria if isinstance(criteria, list) else []
    total = sum((c.get("weight") or 0) for c in criteria) or 1
    norm = [
        {
            "name": str(c.get("name") or "Criterion"),
            "weight": round((c.get("weight") or 0) / total * 100),
            "description": c.get("description") or "",
        }
        for c in criteria
    ]
    return {"title": data.get("title") or "", "summary": data.get("summary") or "", "criteria": norm}


def _weighted_overall(criteria: list, criteria_scores: list) -> float | None:
    by = {str(c.get("name", "")).lower(): (c.get("weight") or 0) for c in criteria}
    acc = wsum = 0.0
    for cs in criteria_scores or []:
        w = by.get(str(cs.get("name", "")).lower())
        if w:
            acc += (cs.get("score") or 0) * w
            wsum += w
    return round(acc / wsum, 1) if wsum else None


def _rank_score(overall: float | None, wait_weight: int) -> float | None:
    """Blend AI match (0-100) with wait urgency. wait_weight 1..3."""
    if overall is None:
        return None
    return round(0.7 * overall + 0.3 * (wait_weight / 3 * 100), 1)


# ── Rubric + scoring building blocks ─────────────────────────────────────────

def generate_rubric_and_skills(jd_text: str) -> dict:
    """JD text → {rubric: {...}, skills: [...], model}. Two LLM calls."""
    rubric_raw, model = _azure_json(RUBRIC_PROMPT, jd_text[:12000])
    rubric = _normalize_rubric(rubric_raw)
    time.sleep(SLEEP_BETWEEN_CANDIDATES)
    skills_raw, _ = _azure_json(SKILLS_PROMPT, jd_text[:12000])
    skills = skills_raw.get("skills") if isinstance(skills_raw, dict) else None
    skills = [s for s in (skills or []) if s.get("name")]
    # primary first
    skills.sort(key=lambda s: 0 if str(s.get("tier", "")).lower() == "primary" else 1)
    return {"rubric": rubric, "skills": skills, "model": model}


def score_resume(resume_text: str, rubric: dict, skills: list) -> dict:
    """Resume text + rubric/skills → score payload (criteria scores, overall,
    metadata, per-skill assessments). Two LLM calls."""
    criteria = rubric.get("criteria") or []
    user = (
        "RUBRIC CRITERIA (name, weight, what-strong-looks-like):\n"
        + json.dumps(criteria)
        + "\n\nRESUME:\n"
        + resume_text[:14000]
    )
    scored, model = _azure_json(SCORE_PROMPT, user)
    cs = scored.get("criteria_scores") if isinstance(scored, dict) else None
    cs = cs if isinstance(cs, list) else []
    overall = _weighted_overall(criteria, cs)
    if overall is None:
        try:
            overall = round(float(scored.get("overall_score")), 1)
        except Exception:
            overall = None

    assessments: list = []
    if skills:
        time.sleep(SLEEP_BETWEEN_CANDIDATES)
        a_user = (
            "SKILLS:\n" + json.dumps([{"name": s["name"], "description": s.get("description", "")} for s in skills])
            + "\n\nRESUME:\n" + resume_text[:14000]
        )
        a_raw, _ = _azure_json(ASSESS_PROMPT, a_user)
        assessments = a_raw.get("assessments") if isinstance(a_raw, dict) else None
        assessments = assessments if isinstance(assessments, list) else []

    extracted = {
        k: scored.get(k)
        for k in ("candidate_name", "email", "phone", "location", "education",
                  "experience_range", "current_company", "relevant_skills", "summary")
    }
    return {
        "overall_score": overall,
        "criteria_scores": cs,
        "skill_assessments": assessments,
        "extracted": extracted,
        "model": model,
    }


def _resume_text_for(candidate_id: int, resume_val: str | None) -> str | None:
    key = resolve_resume_key(resume_val, candidate_id)
    if not key:
        return None
    data = get_object_bytes(key)
    low = key.lower()
    if low.endswith(".pdf"):
        return _pdf_to_text(data)
    if low.endswith((".docx", ".doc")):
        return _docx_to_text(data)
    try:
        return data.decode("utf-8", "ignore")
    except Exception:
        return None


# ── Scope: which (candidate, demand) pairs belong to this caller ─────────────

def scoped_candidate_rows(db: Session, user) -> list:
    """Candidates whose demand is in the caller's scope and which can map to OL.
    Returns rows with: candidate_id, email, job_id, ol_jp_id, resume_val,
    role_title, client_name, kam_name, bh_name."""
    Kam = aliased(User)
    Bh = aliased(User)
    q = (
        db.query(
            Candidate.id.label("candidate_id"),
            Candidate.full_name.label("full_name"),
            Candidate.email.label("email"),
            Candidate.resume_data.label("resume_data"),
            Candidate.resume.label("resume"),
            Job.id.label("job_id"),
            Job.job_id.label("ol_jp_id"),
            Job.role_title.label("role_title"),
            Job.client_name.label("client_name"),
            Kam.name.label("kam_name"),
            Bh.name.label("bh_name"),
        )
        .join(Job, Job.id == Candidate.job_id)
        .outerjoin(Kam, Kam.id == Job.created_by_id)
        .outerjoin(Bh, Bh.id == Job.account_manager_id)
        .filter(Candidate.email.isnot(None), Job.job_id.isnot(None))
    )
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role == "kam":
        q = q.filter(Job.created_by_id == user.id)
    elif role in ("bh", "delivery_lead") and user.pod_id is not None:
        q = q.filter(Kam.pod_id == user.pod_id)
    elif user.pod_id is not None:  # admin/coo/ceo/ops_head with a pod
        q = q.filter(Kam.pod_id == user.pod_id)
    return q.all()


def _ol_step7_buckets(rows: list) -> dict:
    """Map candidate_id -> (bucket, wait_weight) for those at OL step 7 within an
    in-suggestion bucket (0-3/4-5/6-7). Candidates not at step 7, or stuck >7
    days, are absent from the map."""
    out: dict[int, tuple[str, int]] = {}
    emails = list({(r.email or "").strip().lower() for r in rows if r.email and r.email.strip()})
    jp_ids = list({r.ol_jp_id for r in rows if r.ol_jp_id is not None})
    if not emails or not jp_ids:
        return out
    from features.mrr.ol_lookup.routes import _get_ol_conn
    email_to_uid: dict[str, int] = {}
    aj: dict[tuple[int, int], datetime] = {}
    ol = _get_ol_conn()
    try:
        with ol.cursor() as cur:
            fe = ",".join(["%s"] * len(emails))
            cur.execute(f"SELECT id, LOWER(email) AS em FROM users WHERE LOWER(email) IN ({fe})", emails)
            for r in cur.fetchall():
                if r.get("em"):
                    email_to_uid[r["em"]] = r["id"]
            uids = list({v for v in email_to_uid.values()})
            if uids:
                fu = ",".join(["%s"] * len(uids))
                fj = ",".join(["%s"] * len(jp_ids))
                cur.execute(
                    f"""SELECT user_id, job_posting_id, updated_at FROM applied_jobs
                        WHERE user_id IN ({fu}) AND job_posting_id IN ({fj})
                          AND current_step = 7 ORDER BY updated_at DESC""",
                    (*uids, *jp_ids),
                )
                for r in cur.fetchall():
                    key = (r["user_id"], r["job_posting_id"])
                    if key not in aj:
                        aj[key] = r["updated_at"]
    finally:
        ol.close()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for r in rows:
        uid = email_to_uid.get((r.email or "").strip().lower())
        if uid is None:
            continue
        upd = aj.get((uid, r.ol_jp_id))
        if upd is None:
            continue
        age = max((now - upd).days, 0)
        bucket = "d0_3" if age <= 3 else "d4_5" if age <= 5 else "d6_7" if age <= 7 else "dgt7"
        if bucket in IN_BUCKETS:
            out[r.candidate_id] = (bucket, BUCKET_WEIGHT[bucket])
    return out


def effective_jd_text(db: Session, job: Job, rubric_row: AiJdRubric | None) -> str:
    """A *real* JD only: KAM override (from ai_jd_rubrics) → jobs.jd_raw_text.
    jd_summary is intentionally NOT used — it is frequently just the role title,
    which would produce a meaningless rubric. Demands with neither become no_jd."""
    if rubric_row and rubric_row.jd_is_override and (rubric_row.jd_text_effective or "").strip():
        return rubric_row.jd_text_effective.strip()
    if job.jd_raw_text and job.jd_raw_text.strip():
        return job.jd_raw_text.strip()
    return ""


# ── Background run ───────────────────────────────────────────────────────────

def _run_id_active(db: Session, kam_user_id: int) -> AiScoringRun | None:
    return (
        db.query(AiScoringRun)
        .filter(AiScoringRun.kam_user_id == kam_user_id, AiScoringRun.status == "running")
        .order_by(AiScoringRun.id.desc())
        .first()
    )


def start_run(kam_user_id: int, user_snapshot: dict, candidate_ids: list[int] | None = None) -> dict:
    """Create a run row and kick off the background worker. Returns run status.
    Raises RuntimeError if a run is already active for this KAM.
    candidate_ids (optional) limits scoring to that subset; omitted → all the
    caller's in-bucket candidates."""
    db = SessionLocal()
    try:
        if _run_id_active(db, kam_user_id):
            raise RuntimeError("A scoring run is already in progress.")
        run = AiScoringRun(kam_user_id=kam_user_id, status="running", total=0, completed=0)
        db.add(run)
        db.commit()
        run_id = run.id
    finally:
        db.close()
    ids = list(candidate_ids) if candidate_ids else None
    t = threading.Thread(target=_worker, args=(run_id, kam_user_id, user_snapshot, ids), daemon=True)
    t.start()
    return {"run_id": run_id, "status": "running"}


class _U:
    """Lightweight user stand-in for scope queries inside the worker thread."""
    def __init__(self, d: dict):
        self.id = d["id"]
        self.role = d["role"]
        self.pod_id = d.get("pod_id")


def _is_cancelled(db: Session, run_id: int) -> bool:
    st = db.execute(
        text("SELECT status FROM ai_scoring_runs WHERE id=:i"), {"i": run_id}
    ).scalar()
    return st is not None and st != "running"


def _worker(run_id: int, kam_user_id: int, user_snapshot: dict, candidate_ids: list[int] | None = None):
    db = SessionLocal()
    try:
        rows = scoped_candidate_rows(db, _U(user_snapshot))
        # rejected candidates are never scored / re-suggested
        rejected = {
            (r.candidate_id, r.job_id)
            for r in db.query(AiCandidateReject.candidate_id, AiCandidateReject.job_id).all()
        }
        id_filter = set(candidate_ids) if candidate_ids else None
        buckets = _ol_step7_buckets(rows)
        targets = [
            r for r in rows
            if r.candidate_id in buckets and (r.candidate_id, r.job_id) not in rejected
            and (id_filter is None or r.candidate_id in id_filter)
        ]

        run = db.get(AiScoringRun, run_id)

        # group by demand so we build each rubric once
        by_job: dict[int, list] = {}
        for r in targets:
            by_job.setdefault(r.job_id, []).append(r)

        # pre-pass: resolve each demand's effective JD. Only candidates whose
        # demand has a real JD are actually AI-scored, so only THEY count toward
        # progress (total/completed). No-JD candidates are marked separately and
        # excluded from the "Analyzing X of N" count (no AI call, no wait).
        job_jd: dict[int, str] = {}
        for jid in by_job:
            rb0 = db.query(AiJdRubric).filter(AiJdRubric.job_id == jid).first()
            job_jd[jid] = effective_jd_text(db, db.get(Job, jid), rb0)
        run.total = sum(len(c) for jid, c in by_job.items() if job_jd[jid])
        db.commit()

        cancelled = False
        for job_id, cand_rows in by_job.items():
            if _is_cancelled(db, run_id):
                cancelled = True
                break
            rubric_row = db.query(AiJdRubric).filter(AiJdRubric.job_id == job_id).first()
            jd_text = job_jd[job_id]

            if not jd_text:
                # no JD → mark candidates no_jd (sink to bottom), allow Add JD later.
                # Not counted toward progress and no pacing wait (no AI call).
                if not rubric_row:
                    rubric_row = AiJdRubric(job_id=job_id, status="no_jd")
                    db.add(rubric_row)
                else:
                    rubric_row.status = "no_jd"
                db.commit()
                for r in cand_rows:
                    _upsert_no_jd(db, r, rubric_row.id, buckets[r.candidate_id])
                    db.commit()
                continue

            jd_hash = _sha(jd_text)
            if not rubric_row:
                rubric_row = AiJdRubric(job_id=job_id, jd_text_effective=jd_text, status="pending")
                db.add(rubric_row)
                db.commit()
            # (re)generate rubric if JD changed or never built
            if rubric_row.status != "ready" or rubric_row.jd_hash != jd_hash or not rubric_row.rubric_json:
                try:
                    rubric_row.status = "scoring"
                    rubric_row.jd_text_effective = jd_text
                    db.commit()
                    built = generate_rubric_and_skills(jd_text)
                    rubric_row.rubric_json = json.dumps(built["rubric"])
                    rubric_row.skills_json = json.dumps(built["skills"])
                    rubric_row.jd_hash = jd_hash
                    rubric_row.model = built["model"]
                    rubric_row.status = "ready"
                    rubric_row.error = None
                    db.commit()
                except Exception as e:  # rubric failed → skip this demand's candidates
                    rubric_row.status = "error"
                    rubric_row.error = str(e)[:1000]
                    db.commit()
                    continue

            rubric = json.loads(rubric_row.rubric_json)
            skills = json.loads(rubric_row.skills_json or "[]")
            rubric_hash = rubric_row.jd_hash

            for r in cand_rows:
                if _is_cancelled(db, run_id):
                    cancelled = True
                    break
                did_llm = _score_one(db, r, rubric_row.id, rubric, skills, rubric_hash, buckets[r.candidate_id])
                run.completed += 1
                db.commit()
                if did_llm:  # only pace when an actual model call happened
                    time.sleep(SLEEP_BETWEEN_CANDIDATES)
            if cancelled:
                break

        # don't clobber a cancellation requested mid-run
        run = db.get(AiScoringRun, run_id)
        if run and run.status == "running":
            run.status = "done"
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
    except Exception as e:
        try:
            run = db.get(AiScoringRun, run_id)
            if run:
                run.status = "error"
                run.error = str(e)[:1000]
                run.finished_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _existing_score(db: Session, candidate_id: int, job_id: int) -> AiCandidateScore | None:
    return (
        db.query(AiCandidateScore)
        .filter(AiCandidateScore.candidate_id == candidate_id, AiCandidateScore.job_id == job_id)
        .first()
    )


def _upsert_no_jd(db: Session, r, rubric_id: int, bucket_weight: tuple[str, int]):
    bucket, weight = bucket_weight
    row = _existing_score(db, r.candidate_id, r.job_id)
    if not row:
        row = AiCandidateScore(candidate_id=r.candidate_id, job_id=r.job_id)
        db.add(row)
    row.rubric_id = rubric_id
    row.bucket = bucket
    row.wait_weight = weight
    row.status = "no_jd"
    row.overall_score = None
    row.rank_score = None
    db.commit()


def _score_one(db: Session, r, rubric_id: int, rubric: dict, skills: list, rubric_hash: str, bucket_weight: tuple[str, int]) -> bool:
    """Score one candidate. Returns True only if an actual LLM call was made
    (so the caller knows whether to apply the pacing wait)."""
    bucket, weight = bucket_weight
    row = _existing_score(db, r.candidate_id, r.job_id)
    # reuse if already scored against the current rubric (resumes rarely change)
    if row and row.status == "scored" and row.rubric_hash == rubric_hash and row.overall_score is not None:
        # keep fresh bucket/wait + rank
        row.bucket, row.wait_weight = bucket, weight
        row.rank_score = _rank_score(row.overall_score, weight)
        db.commit()
        return False  # no model call → no wait
    if not row:
        row = AiCandidateScore(candidate_id=r.candidate_id, job_id=r.job_id, decision="pending")
        db.add(row)
    row.rubric_id = rubric_id
    row.bucket, row.wait_weight = bucket, weight

    resume_val = r.resume_data or r.resume
    try:
        text_ = _resume_text_for(r.candidate_id, resume_val)
    except Exception as e:
        row.status = "error"
        row.error = f"resume fetch failed: {str(e)[:300]}"
        db.commit()
        return False  # no model call
    if not text_ or not text_.strip():
        row.status = "no_resume"
        row.overall_score = None
        row.rank_score = None
        db.commit()
        return False  # no model call
    try:
        out = score_resume(text_, rubric, skills)
        row.overall_score = out["overall_score"]
        row.criteria_scores_json = json.dumps(out["criteria_scores"])
        row.skill_assessments_json = json.dumps(out["skill_assessments"])
        row.extracted_json = json.dumps(out["extracted"])
        row.resume_key = resolve_resume_key(resume_val, r.candidate_id)
        row.resume_hash = _sha(text_)
        row.rubric_hash = rubric_hash
        row.model = out["model"]
        row.rank_score = _rank_score(out["overall_score"], weight)
        row.status = "scored"
        row.error = None
    except Exception as e:
        row.status = "error"
        row.error = str(e)[:1000]
    db.commit()
    return True  # an LLM scoring attempt was made
