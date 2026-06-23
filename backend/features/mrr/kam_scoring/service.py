"""AI resume-vs-JD scoring for the KAM Interviews Suggestion section.

Ports the rubric / resume-scoring / skill-matrix approach from the reference
`ai-scoring-tool` onto our Azure OpenAI + S3 + Postgres stack. Fully additive:
reads existing candidate/job data, writes only to the ai_* tables.
"""
from __future__ import annotations

import hashlib
import json
import os
import random
import threading
import time
import urllib.request
from datetime import datetime, timezone
from types import SimpleNamespace
from urllib.parse import quote

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

AZURE_MAX_RETRIES = 5      # retries on rate-limit / transient errors
AZURE_MAX_BACKOFF = 30.0   # seconds, cap for exponential backoff


def _retry_after_seconds(err) -> float | None:
    """Honour a Retry-After header on a rate-limit error, if present."""
    resp = getattr(err, "response", None)
    hdr = getattr(resp, "headers", None)
    if not hdr:
        return None
    val = hdr.get("retry-after") or hdr.get("Retry-After")
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def _azure_json(system: str, user: str) -> tuple[dict, str]:
    """One JSON-mode chat completion against Azure OpenAI. Returns (parsed, model).
    Retries on 429 (rate limit) and transient timeout/connection/5xx errors with
    exponential backoff + jitter (honouring Retry-After when supplied)."""
    from openai import (
        APIConnectionError,
        APITimeoutError,
        AzureOpenAI,
        InternalServerError,
        RateLimitError,
    )
    client = AzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_version=os.getenv("AZURE_API_VERSION"),
        max_retries=0,  # we manage retries here
    )
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    backoff = 2.0
    for attempt in range(AZURE_MAX_RETRIES + 1):
        try:
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
        except (RateLimitError, APITimeoutError, APIConnectionError, InternalServerError) as e:
            if attempt >= AZURE_MAX_RETRIES:
                raise
            wait = _retry_after_seconds(e) or backoff
            time.sleep(wait + random.uniform(0, 0.5))
            backoff = min(backoff * 2, AZURE_MAX_BACKOFF)


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
    """JD text → {rubric: {...}, skills: [...], model}. Two LLM calls (once per demand)."""
    rubric_raw, model = _azure_json(RUBRIC_PROMPT, jd_text[:12000])
    rubric = _normalize_rubric(rubric_raw)
    skills_raw, _ = _azure_json(SKILLS_PROMPT, jd_text[:12000])
    skills = skills_raw.get("skills") if isinstance(skills_raw, dict) else None
    skills = [s for s in (skills or []) if s.get("name")]
    # primary first
    skills.sort(key=lambda s: 0 if str(s.get("tier", "")).lower() == "primary" else 1)
    return {"rubric": rubric, "skills": skills, "model": model}


# Single prompt that does BOTH the rubric scoring (was SCORE_PROMPT) and the
# per-skill assessment (was ASSESS_PROMPT) in one call — same inputs, same
# constraints, half the round-trips. Keeps every rule from the two originals.
COMBINED_SCORE_PROMPT = """You are an expert recruiter. Given a job's scoring rubric, a fixed list of must-have skills, and a candidate's resume, do BOTH tasks in ONE response.
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
  "summary": "2-3 sentence evaluation of fit",
  "assessments": [
    { "skill": "<must exactly match a provided skill name>", "statement": "crisp evidence fragment", "score": <0-100> }
  ]
}
SCORING (criteria_scores + overall_score): score the resume honestly against EACH rubric criterion. If information is missing, score conservatively and say so in the rationale.
SKILL ASSESSMENTS (assessments): return exactly one assessment for EVERY provided skill, using the same skill name. Base statements only on the resume. STATEMENT STYLE: short and crisp, max ~12 words; state the evidence directly as a fragment — do NOT start with "The candidate", "This candidate", "Has", or "Demonstrates". Examples: "7 yrs Node.js building payment APIs at Acme." / "Led 4-person team at a fintech startup." / "No evidence in resume." Make each statement specific to ITS skill. If there is no evidence, statement = "No evidence in resume." and score low."""


def score_resume(resume_text: str, rubric: dict, skills: list) -> dict:
    """Resume text + rubric/skills → score payload (criteria scores, overall,
    metadata, per-skill assessments) in a SINGLE LLM call."""
    criteria = rubric.get("criteria") or []
    user = (
        "RUBRIC CRITERIA (name, weight, what-strong-looks-like):\n"
        + json.dumps(criteria)
        + "\n\nMUST-HAVE SKILLS (assess each, in order):\n"
        + json.dumps([{"name": s["name"], "description": s.get("description", "")} for s in skills])
        + "\n\nRESUME:\n"
        + resume_text[:14000]
    )
    out, model = _azure_json(COMBINED_SCORE_PROMPT, user)
    out = out if isinstance(out, dict) else {}

    cs = out.get("criteria_scores")
    cs = cs if isinstance(cs, list) else []
    overall = _weighted_overall(criteria, cs)
    if overall is None:
        try:
            overall = round(float(out.get("overall_score")), 1)
        except Exception:
            overall = None

    assessments = out.get("assessments")
    assessments = assessments if isinstance(assessments, list) else []

    extracted = {
        k: out.get(k)
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


def _resume_text_for_row(r) -> str | None:
    """Resume text for a unified row — MRR (our S3) or OL (public OL S3 URL)."""
    if r.source == "ol":
        url = ol_resume_url(r.ol_cp_id, r.ol_resume_filename)
        if not url:
            return None
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        low = (r.ol_resume_filename or "").lower()
        if low.endswith(".pdf"):
            return _pdf_to_text(data)
        if low.endswith((".docx", ".doc")):
            return _docx_to_text(data)
        try:
            return data.decode("utf-8", "ignore")
        except Exception:
            return None
    return _resume_text_for(r.candidate_id, r.resume_data or r.resume)


# ── Unified subject universe (MRR candidates + OL-only candidates) ───────────
#
# Each universe row is a SimpleNamespace with a stable string ``key``:
#   mrr:{candidate_id}:{job_id}   |   ol:{ol_user_id}:{ol_job_posting_id}
# plus source, ids, display fields, and (for OL rows) a precomputed bucket, the
# OL JD text, and a resume locator (candidate_profiles.id + filename).

OL_SUGGESTION_DAYS = 8       # OL step-7 lookback covering the 0-3/4-5/6-7 buckets
OL_INTERVIEWS_DAYS = 30      # wider lookback for the KAM Interviews aggregate (incl >7)
OL_MIN_JD_CHARS = 40         # OL description shorter than this → treat as no JD
OL_RESUME_BASE = "https://j2wofferletter.s3.amazonaws.com/production/uploads/candidate_profile/resume"


def _ns(**kw):
    return SimpleNamespace(**kw)


def _role_of(user) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def ol_resume_url(cp_id, filename) -> str | None:
    if not cp_id or not filename:
        return None
    return f"{OL_RESUME_BASE}/{cp_id}/{quote(str(filename))}"


def scoped_candidate_rows(db: Session, user) -> list:
    """The caller-scoped suggestion universe = MRR candidates (mapped to OL) +
    OL-only step-7 candidates, returned as unified namespace rows."""
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
    role = _role_of(user)
    if role == "kam":
        q = q.filter(Job.created_by_id == user.id)
    elif role in ("bh", "delivery_lead") and user.pod_id is not None:
        q = q.filter(Kam.pod_id == user.pod_id)
    elif user.pod_id is not None:  # admin/coo/ceo/ops_head with a pod
        q = q.filter(Kam.pod_id == user.pod_id)

    mrr = [
        _ns(
            key=f"mrr:{r.candidate_id}:{r.job_id}", source="mrr",
            candidate_id=r.candidate_id, job_id=r.job_id,
            ol_user_id=None, ol_job_posting_id=None,
            full_name=r.full_name, email=r.email,
            resume_data=r.resume_data, resume=r.resume,
            ol_cp_id=None, ol_resume_filename=None, ol_jp_id=r.ol_jp_id,
            role_title=r.role_title, client_name=r.client_name,
            kam_name=r.kam_name, bh_name=r.bh_name,
            bucket=None, wait_weight=None, jd_text=None,
        )
        for r in q.all()
    ]
    return mrr + ol_only_step7_rows(db, user)


def _scope_bh(db: Session, user) -> tuple[str, int | None]:
    """('all', None) → see every OL demand; ('bh', bh_user_id) → only demands
    whose derived BH is this caller's pod BH; ('none', None) → no OL rows."""
    role = _role_of(user)
    if role in ("admin", "coo", "ceo", "ops_head") and user.pod_id is None:
        return ("all", None)
    if user.pod_id is None:
        return ("none", None)
    bh = db.execute(text("SELECT bh_user_id FROM pods WHERE id=:p"), {"p": user.pod_id}).scalar()
    return ("bh", bh)


def _mrr_client_maps(db: Session):
    """client_id → BH (dominant account_manager on MRR jobs); id → user name;
    client_id → client name (of_clients)."""
    rows = db.execute(text("""
        SELECT j.client_id, MODE() WITHIN GROUP (ORDER BY j.account_manager_id) AS bh_id
        FROM jobs j
        WHERE j.client_id IS NOT NULL AND j.account_manager_id IS NOT NULL
        GROUP BY j.client_id
    """)).all()
    cid_bh = {cid: bh for cid, bh in rows if bh is not None}
    user_names = dict(db.execute(text("SELECT id, name FROM users")).all())
    cid_cname = dict(db.execute(text("SELECT client_id, name FROM of_clients WHERE client_id IS NOT NULL")).all())
    return cid_bh, user_names, cid_cname


def _mrr_covered_pairs(db: Session) -> set:
    """(lower(email), ol_job_posting_id) already represented by an MRR candidate —
    used to dedup OL-only rows against the MRR universe."""
    rows = db.execute(text("""
        SELECT LOWER(c.email) AS em, j.job_id AS jp
        FROM candidates c JOIN jobs j ON j.id = c.job_id
        WHERE c.email IS NOT NULL AND c.email <> '' AND j.job_id IS NOT NULL
    """)).all()
    return {(em, jp) for em, jp in rows if em and jp is not None}


def ol_only_step7_rows(db: Session, user, lookback_days: int = OL_SUGGESTION_DAYS, include_gt7: bool = False) -> list:
    """Step-7 OL candidates NOT in MRR, scoped to the caller, as unified rows.
    By default only the 0-3/4-5/6-7 buckets (Suggestion); include_gt7=True keeps
    the >7 bucket too (KAM Interviews aggregate)."""
    mode, scope_bh = _scope_bh(db, user)
    if mode == "none":
        return []
    cid_bh, user_names, cid_cname = _mrr_client_maps(db)
    name_to_uid = {(n or "").strip().lower(): i for i, n in user_names.items() if n}
    from features.mrr.coo.routes import _lookup_bh  # client_bh_mapping.csv (xlsx)
    covered = _mrr_covered_pairs(db)

    from features.mrr.ol_lookup.routes import _get_ol_conn
    ol = _get_ol_conn()
    try:
        with ol.cursor() as cur:
            cur.execute(f"""
                SELECT aj.user_id, aj.job_posting_id, aj.updated_at,
                       u.email, u.first_name, u.middle_name, u.last_name,
                       cp.id AS cp_id, cp.resume,
                       jp.title, jp.description, jp.client_id,
                       cl.company_name
                FROM applied_jobs aj
                JOIN users u ON u.id = aj.user_id
                LEFT JOIN candidate_profiles cp ON cp.user_id = aj.user_id
                LEFT JOIN job_postings jp ON jp.id = aj.job_posting_id
                LEFT JOIN clients cl ON cl.user_id = jp.client_id
                WHERE aj.current_step = '7'
                  AND aj.updated_at >= (UTC_TIMESTAMP() - INTERVAL {int(lookback_days)} DAY)
            """)
            raw = cur.fetchall()
    finally:
        ol.close()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    out = []
    for r in raw:
        email = (r["email"] or "").strip().lower()
        jp = r["job_posting_id"]
        if not email or jp is None or (email, jp) in covered:
            continue
        # BH: prefer the curated client_bh_mapping.csv (by client name), else the
        # dominant MRR account_manager for this client_id.
        csv_bh_name = _lookup_bh(r["company_name"] or cid_cname.get(r["client_id"]) or "")
        if csv_bh_name:
            bh_name = csv_bh_name
            bh_uid = name_to_uid.get(csv_bh_name.strip().lower())
        else:
            bh_uid = cid_bh.get(r["client_id"])
            bh_name = user_names.get(bh_uid) if bh_uid else None
        if mode == "bh" and bh_uid != scope_bh:
            continue
        upd = r["updated_at"]
        if upd is None:
            continue
        age = max((now - upd).days, 0)
        bucket = "d0_3" if age <= 3 else "d4_5" if age <= 5 else "d6_7" if age <= 7 else "dgt7"
        if bucket not in IN_BUCKETS and not include_gt7:
            continue
        name = " ".join(filter(None, [r["first_name"], r["middle_name"], r["last_name"]])).strip() or r["email"]
        jd = (r["description"] or "").strip()
        out.append(_ns(
            key=f"ol:{r['user_id']}:{jp}", source="ol",
            candidate_id=None, job_id=None,
            ol_user_id=r["user_id"], ol_job_posting_id=jp,
            full_name=name, email=r["email"],
            resume_data=None, resume=None,
            ol_cp_id=r["cp_id"], ol_resume_filename=r["resume"], ol_jp_id=None,
            role_title=r["title"], client_name=cid_cname.get(r["client_id"]) or r["company_name"],
            kam_name=None, bh_name=bh_name,
            bucket=bucket, wait_weight=BUCKET_WEIGHT.get(bucket, 0),
            jd_text=(jd if len(jd) >= OL_MIN_JD_CHARS else ""),
        ))
    return out


def _ol_step7_buckets(rows: list) -> dict:
    """Map row.key -> (bucket, wait_weight) for in-bucket step-7 rows. OL rows
    carry their bucket already; MRR rows are matched to OL by email."""
    out: dict[str, tuple[str, int]] = {}
    for r in rows:
        if r.source == "ol" and r.bucket in IN_BUCKETS:
            out[r.key] = (r.bucket, r.wait_weight)

    mrr = [r for r in rows if r.source == "mrr"]
    emails = list({(r.email or "").strip().lower() for r in mrr if r.email and r.email.strip()})
    jp_ids = list({r.ol_jp_id for r in mrr if r.ol_jp_id is not None})
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
                    k = (r["user_id"], r["job_posting_id"])
                    if k not in aj:
                        aj[k] = r["updated_at"]
    finally:
        ol.close()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for r in mrr:
        uid = email_to_uid.get((r.email or "").strip().lower())
        if uid is None:
            continue
        upd = aj.get((uid, r.ol_jp_id))
        if upd is None:
            continue
        age = max((now - upd).days, 0)
        bucket = "d0_3" if age <= 3 else "d4_5" if age <= 5 else "d6_7" if age <= 7 else "dgt7"
        if bucket in IN_BUCKETS:
            out[r.key] = (bucket, BUCKET_WEIGHT[bucket])
    return out


def effective_jd_text_for(db: Session, row, rubric_row: AiJdRubric | None) -> str:
    """Resolve a row's JD: KAM override → (MRR jobs.jd_raw_text | OL description)."""
    if rubric_row and rubric_row.jd_is_override and (rubric_row.jd_text_effective or "").strip():
        return rubric_row.jd_text_effective.strip()
    if row.source == "ol":
        return (row.jd_text or "").strip()
    job = db.get(Job, row.job_id)
    if job and job.jd_raw_text and job.jd_raw_text.strip():
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


def start_run(kam_user_id: int, user_snapshot: dict, keys: list[str] | None = None) -> dict:
    """Create a run row and kick off the background worker. Returns run status.
    Raises RuntimeError if a run is already active for this KAM.
    keys (optional) limits scoring to those row keys; omitted → all the caller's
    in-bucket candidates."""
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
    key_list = list(keys) if keys else None
    t = threading.Thread(target=_worker, args=(run_id, kam_user_id, user_snapshot, key_list), daemon=True)
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


def _demand_key(r):
    return ("ol", r.ol_job_posting_id) if r.source == "ol" else ("mrr", r.job_id)


def _reject_key(rj) -> str:
    return f"ol:{rj.ol_user_id}:{rj.ol_job_posting_id}" if rj.source == "ol" else f"mrr:{rj.candidate_id}:{rj.job_id}"


def _rubric_for(db: Session, r) -> AiJdRubric | None:
    if r.source == "ol":
        return db.query(AiJdRubric).filter(AiJdRubric.source == "ol", AiJdRubric.ol_job_posting_id == r.ol_job_posting_id).first()
    return db.query(AiJdRubric).filter(AiJdRubric.source == "mrr", AiJdRubric.job_id == r.job_id).first()


def _new_rubric(r, **kw) -> AiJdRubric:
    if r.source == "ol":
        return AiJdRubric(source="ol", ol_job_posting_id=r.ol_job_posting_id, **kw)
    return AiJdRubric(source="mrr", job_id=r.job_id, **kw)


def _worker(run_id: int, kam_user_id: int, user_snapshot: dict, keys: list[str] | None = None):
    db = SessionLocal()
    try:
        rows = scoped_candidate_rows(db, _U(user_snapshot))
        # rejected subjects (mrr or ol) are never scored / re-suggested
        rejected = {_reject_key(rj) for rj in db.query(AiCandidateReject).all()}
        key_filter = set(keys) if keys else None
        buckets = _ol_step7_buckets(rows)
        targets = [
            r for r in rows
            if r.key in buckets and r.key not in rejected
            and (key_filter is None or r.key in key_filter)
        ]

        run = db.get(AiScoringRun, run_id)

        # group by demand (mrr job or ol job_posting) so we build each rubric once
        by_demand: dict = {}
        for r in targets:
            by_demand.setdefault(_demand_key(r), []).append(r)

        # pre-pass: resolve each demand's effective JD. Only candidates whose
        # demand has a real JD are actually AI-scored, so only THEY count toward
        # progress (total/completed). No-JD candidates are marked separately.
        demand_jd: dict = {}
        for dkey, crows in by_demand.items():
            rep = crows[0]
            demand_jd[dkey] = effective_jd_text_for(db, rep, _rubric_for(db, rep))
        run.total = sum(len(c) for dkey, c in by_demand.items() if demand_jd[dkey])
        db.commit()

        cancelled = False
        for dkey, cand_rows in by_demand.items():
            if _is_cancelled(db, run_id):
                cancelled = True
                break
            rep = cand_rows[0]
            rubric_row = _rubric_for(db, rep)
            jd_text = demand_jd[dkey]

            if not jd_text:
                # no JD → mark candidates no_jd (sink to bottom), allow Add JD later.
                if not rubric_row:
                    rubric_row = _new_rubric(rep, status="no_jd")
                    db.add(rubric_row)
                else:
                    rubric_row.status = "no_jd"
                db.commit()
                for r in cand_rows:
                    _upsert_no_jd(db, r, rubric_row.id, buckets[r.key])
                    db.commit()
                continue

            jd_hash = _sha(jd_text)
            if not rubric_row:
                rubric_row = _new_rubric(rep, jd_text_effective=jd_text, status="pending")
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
                _score_one(db, r, rubric_row.id, rubric, skills, rubric_hash, buckets[r.key])
                run.completed += 1
                db.commit()
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


def _existing_score(db: Session, r) -> AiCandidateScore | None:
    if r.source == "ol":
        return (
            db.query(AiCandidateScore)
            .filter(AiCandidateScore.source == "ol",
                    AiCandidateScore.ol_user_id == r.ol_user_id,
                    AiCandidateScore.ol_job_posting_id == r.ol_job_posting_id)
            .first()
        )
    return (
        db.query(AiCandidateScore)
        .filter(AiCandidateScore.source == "mrr",
                AiCandidateScore.candidate_id == r.candidate_id,
                AiCandidateScore.job_id == r.job_id)
        .first()
    )


def _new_score(r, **kw) -> AiCandidateScore:
    if r.source == "ol":
        return AiCandidateScore(source="ol", ol_user_id=r.ol_user_id, ol_job_posting_id=r.ol_job_posting_id, **kw)
    return AiCandidateScore(source="mrr", candidate_id=r.candidate_id, job_id=r.job_id, **kw)


def _upsert_no_jd(db: Session, r, rubric_id: int, bucket_weight: tuple[str, int]):
    bucket, weight = bucket_weight
    row = _existing_score(db, r)
    if not row:
        row = _new_score(r)
        db.add(row)
    row.rubric_id = rubric_id
    row.bucket = bucket
    row.wait_weight = weight
    row.status = "no_jd"
    row.overall_score = None
    row.rank_score = None
    db.commit()


def _score_one(db: Session, r, rubric_id: int, rubric: dict, skills: list, rubric_hash: str, bucket_weight: tuple[str, int]) -> bool:
    """Score one candidate (MRR or OL). Returns True only if an actual LLM call
    was made (so the caller knows whether to apply the pacing wait)."""
    bucket, weight = bucket_weight
    row = _existing_score(db, r)
    # reuse if already scored against the current rubric (resumes rarely change)
    if row and row.status == "scored" and row.rubric_hash == rubric_hash and row.overall_score is not None:
        row.bucket, row.wait_weight = bucket, weight
        row.rank_score = _rank_score(row.overall_score, weight)
        db.commit()
        return False  # no model call → no wait
    if not row:
        row = _new_score(r, decision="pending")
        db.add(row)
    row.rubric_id = rubric_id
    row.bucket, row.wait_weight = bucket, weight

    try:
        text_ = _resume_text_for_row(r)
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
        row.resume_key = (ol_resume_url(r.ol_cp_id, r.ol_resume_filename) if r.source == "ol"
                          else resolve_resume_key(r.resume_data or r.resume, r.candidate_id))
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
