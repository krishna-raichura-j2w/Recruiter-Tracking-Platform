import json
import logging

from openai import OpenAI
from sqlalchemy import text as _sa_text
from sqlalchemy.orm import Session

_log = logging.getLogger(__name__)

from core.config import settings
from features.hrbp.governance.constants import CATEGORY_MAP
from features.hrbp.governance.service import (
    _build_category_lookup,
    _calc_escalation_deduction,
    _calc_net_score,
    _get_grade,
    get_or_init_scores,
    get_score_summary,
)
from infra.hrbp_models import (
    HRBPConsultant,
    HRBPProject,
    HRBPProjectCommentHistory,
    HRBPProjectMember,
)

VALID_COHORTS = {"star", "high_performer", "rising", "bedrock", "new_joiner", "watch", "rescue"}
VALID_TIERS   = {"top_20", "middle", "bottom_20"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _project_avg_score(db: Session, project_id: int) -> dict:
    members = (
        db.query(HRBPProjectMember)
        .filter_by(project_id=project_id)
        .all()
    )
    if not members:
        return {"avg_pct": 0, "grade": "N/A", "tone": "info", "member_count": 0}

    total_pct = 0.0
    scored = 0
    for m in members:
        s = get_score_summary(db, m.consultant_id)
        if s["total_possible"] > 0:
            total_pct += s["total_score"] / s["total_possible"] * 100
            scored += 1

    avg_pct = round(total_pct / scored) if scored else 0
    grade, tone = _get_grade(avg_pct, 100)
    return {"avg_pct": avg_pct, "grade": grade, "tone": tone, "member_count": len(members)}


def _apply_governance_deltas(db: Session, consultant_id: int, deltas: dict) -> dict:
    """Apply pre-computed governance deltas to a consultant's scores. Returns per-consultant result."""
    cat_lookup = _build_category_lookup(db, consultant_id)
    all_rows = get_or_init_scores(db, consultant_id)
    score_rows = {s.category_key: s for s in all_rows}
    active_rows = {k: v for k, v in score_rows.items() if v.is_active}
    score_before = sum(s.net_score for s in active_rows.values())
    changes_detail: dict = {}

    for cat_key, raw_delta in deltas.items():
        try:
            delta = int(raw_delta)
        except (TypeError, ValueError):
            continue
        delta = max(-2, min(2, delta))
        if delta == 0:
            continue

        cat = cat_lookup.get(cat_key)
        row = score_rows.get(cat_key)
        if not cat or not row or not row.is_active:
            continue

        cur_idx = row.option_index
        cur_escs = row.escalations
        is_improvement = delta < 0

        if is_improvement and cur_idx == 0 and cur_escs > 0:
            new_escs = max(0, cur_escs - 1)
            row.escalations = new_escs
            row.net_score = _calc_net_score(cat["options"], cur_idx, new_escs, cat["escalation_base"])
            continue

        actual_new_idx = max(0, min(4, cur_idx + delta))
        if actual_new_idx == cur_idx:
            continue

        from_opt = cat["options"][cur_idx]
        to_opt   = cat["options"][actual_new_idx]
        esc_ded  = _calc_escalation_deduction(cur_escs, cat["escalation_base"])
        net_before = max(0, from_opt["score"] - esc_ded)
        net_after  = max(0, to_opt["score"]   - esc_ded)

        row.option_index = actual_new_idx
        row.net_score = _calc_net_score(cat["options"], actual_new_idx, cur_escs, cat["escalation_base"])

        changes_detail[cat_key] = {
            "category_label": cat["label"],
            "from_label": from_opt["label"],
            "to_label":   to_opt["label"],
            "from_score": net_before,
            "to_score":   net_after,
            "score_diff": net_after - net_before,
        }

    db.flush()
    score_after = sum(s.net_score for s in active_rows.values())
    return {
        "score_before":   score_before,
        "score_after":    score_after,
        "score_delta":    score_after - score_before,
        "changes_detail": changes_detail,
    }


# ── Projects CRUD ─────────────────────────────────────────────────────────────

def list_projects(db: Session) -> list[dict]:
    projects = db.query(HRBPProject).order_by(HRBPProject.created_at.desc()).all()
    result = []
    for p in projects:
        score = _project_avg_score(db, p.id)
        result.append({
            "id":           p.id,
            "name":         p.name,
            "description":  p.description,
            "client_id":    p.client_id,
            "status":       p.status,
            "created_at":   p.created_at.isoformat() if p.created_at else None,
            "updated_at":   p.updated_at.isoformat() if p.updated_at else None,
            **score,
        })
    return result


def create_project(db: Session, name: str, description: str, client_id, created_by: int) -> dict:
    p = HRBPProject(
        name=name.strip(),
        description=description.strip(),
        client_id=client_id,
        created_by=created_by,
    )
    db.add(p)
    db.flush()
    return {"id": p.id, "name": p.name, "description": p.description, "status": p.status}


def get_project(db: Session, project_id: int) -> dict:
    p = db.query(HRBPProject).filter_by(id=project_id).first()
    if not p:
        raise ValueError(f"Project {project_id} not found")
    score = _project_avg_score(db, project_id)
    return {
        "id":          p.id,
        "name":        p.name,
        "description": p.description,
        "client_id":   p.client_id,
        "status":      p.status,
        "created_at":  p.created_at.isoformat() if p.created_at else None,
        "updated_at":  p.updated_at.isoformat() if p.updated_at else None,
        **score,
    }


def update_project(db: Session, project_id: int, payload: dict) -> dict:
    p = db.query(HRBPProject).filter_by(id=project_id).first()
    if not p:
        raise ValueError(f"Project {project_id} not found")
    if payload.get("name") is not None:
        p.name = payload["name"].strip()
    if payload.get("description") is not None:
        p.description = payload["description"].strip()
    if payload.get("status") is not None:
        p.status = payload["status"]
    db.flush()
    return get_project(db, project_id)


def delete_project(db: Session, project_id: int) -> None:
    p = db.query(HRBPProject).filter_by(id=project_id).first()
    if not p:
        raise ValueError(f"Project {project_id} not found")
    db.delete(p)
    db.flush()


# ── Members ───────────────────────────────────────────────────────────────────

def list_members(db: Session, project_id: int) -> list[dict]:
    rows = (
        db.query(HRBPProjectMember)
        .filter_by(project_id=project_id)
        .order_by(HRBPProjectMember.added_at)
        .all()
    )
    result = []
    for r in rows:
        c = db.query(HRBPConsultant).filter_by(id=r.consultant_id).first()
        gov = get_score_summary(db, r.consultant_id)
        result.append({
            "consultant_id":   r.consultant_id,
            "emp_id":          c.emp_id if c else None,
            "name":            c.name if c else "Unknown",
            "skill":           c.skill if c else None,
            "designation":     c.designation if c else None,
            "is_active":       c.is_active if c else True,
            "cohort":          r.cohort,
            "perf_tier":       r.perf_tier,
            "role_in_project": r.role_in_project,
            "added_at":        r.added_at.isoformat() if r.added_at else None,
            "gov_score":       gov["total_score"],
            "gov_possible":    gov["total_possible"],
            "gov_grade":       gov["grade"],
            "gov_tone":        gov["tone"],
        })
    return result


def add_member(
    db: Session,
    project_id: int,
    consultant_id: int,
    cohort: str,
    perf_tier: str,
    role_in_project: str,
    added_by: int,
) -> dict:
    if not db.query(HRBPProject).filter_by(id=project_id).first():
        raise ValueError("Project not found")
    if not db.query(HRBPConsultant).filter_by(id=consultant_id).first():
        raise ValueError("Consultant not found")
    existing = (
        db.query(HRBPProjectMember)
        .filter_by(project_id=project_id, consultant_id=consultant_id)
        .first()
    )
    if existing:
        raise ValueError("Consultant is already a member of this project")
    if cohort not in VALID_COHORTS:
        cohort = "bedrock"
    if perf_tier not in VALID_TIERS:
        perf_tier = "middle"

    m = HRBPProjectMember(
        project_id=project_id,
        consultant_id=consultant_id,
        cohort=cohort,
        perf_tier=perf_tier,
        role_in_project=role_in_project,
        added_by=added_by,
    )
    db.add(m)
    db.flush()
    return {"project_id": project_id, "consultant_id": consultant_id, "cohort": cohort, "perf_tier": perf_tier}


def update_member(db: Session, project_id: int, consultant_id: int, payload: dict) -> dict:
    m = (
        db.query(HRBPProjectMember)
        .filter_by(project_id=project_id, consultant_id=consultant_id)
        .first()
    )
    if not m:
        raise ValueError("Member not found in this project")
    if payload.get("cohort") and payload["cohort"] in VALID_COHORTS:
        m.cohort = payload["cohort"]
    if payload.get("perf_tier") and payload["perf_tier"] in VALID_TIERS:
        m.perf_tier = payload["perf_tier"]
    if payload.get("role_in_project") is not None:
        m.role_in_project = payload["role_in_project"]
    db.flush()
    return {"cohort": m.cohort, "perf_tier": m.perf_tier, "role_in_project": m.role_in_project}


def remove_member(db: Session, project_id: int, consultant_id: int) -> None:
    m = (
        db.query(HRBPProjectMember)
        .filter_by(project_id=project_id, consultant_id=consultant_id)
        .first()
    )
    if not m:
        raise ValueError("Member not found in this project")
    db.delete(m)
    db.flush()


# ── Team Comment (AI) ─────────────────────────────────────────────────────────

def _build_team_comment_prompt(comment: str, members: list[dict]) -> tuple[str, str]:
    member_list = "\n".join(f"  - {m['name']}" for m in members)
    cat_keys = ", ".join(f"{k} ({v['label']})" for k, v in CATEGORY_MAP.items())

    system_prompt = (
        "You are an HR analyst reviewing a manager's observation about a project team.\n\n"
        "Delta guide (score adjustments):\n"
        "  -2 = significant improvement  (exceptional, outstanding, major turnaround)\n"
        "  -1 = improvement              (better, resolved, improved, good progress)\n"
        "  +1 = worsening                (issue, concern, inconsistency, flagged)\n"
        "  +2 = significant worsening    (severe, escalation, formal action, repeated violation)\n\n"
        "RULES:\n"
        "1. Read the comment carefully. Identify WHICH specific member each observation is about.\n"
        "2. Each member gets ONLY the adjustments that the comment explicitly says about THEM.\n"
        "   Do NOT apply one member's observation to another member.\n"
        "3. If the comment makes a statement about the whole team with no names, include ALL members "
        "   with the SAME adjustments.\n"
        "4. Only include a category if the comment directly mentions that type of behaviour for that member.\n"
        "5. If direction is unclear for a category, omit it.\n"
        "6. Base deltas on language intensity, not label matching.\n\n"
        "Respond ONLY with valid JSON in this exact format:\n"
        "{\n"
        "  \"members\": [\n"
        "    {\"name\": \"<member name>\", \"adjustments\": {\"<category_key>\": <delta>}},\n"
        "    ...\n"
        "  ],\n"
        "  \"explanation\": \"<concise reason>\"\n"
        "}"
    )

    user_prompt = (
        f"Project team members:\n{member_list}\n\n"
        f"Manager observation: \"{comment}\"\n\n"
        f"Available governance category keys: {cat_keys}\n\n"
        "For each member mentioned, list only their specific adjustments. "
        "Do not carry over one person's observation to another."
    )
    return system_prompt, user_prompt


def analyze_team_comment(
    db: Session,
    project_id: int,
    comment: str,
    created_by: int,
) -> dict:
    if not settings.open_ai_key:
        raise ValueError("OPEN_AI_KEY is not configured")

    members = list_members(db, project_id)
    if not members:
        raise ValueError("No members in this project")

    proj_before = _project_avg_score(db, project_id)
    score_before = proj_before["avg_pct"]

    member_index = {m["name"].lower(): m for m in members}

    system_prompt, user_prompt = _build_team_comment_prompt(
        comment, [{"name": m["name"]} for m in members]
    )

    client = OpenAI(api_key=settings.open_ai_key)
    response = client.chat.completions.create(
        model=settings.open_ai_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.0,
        max_tokens=1500,
    )
    raw = json.loads(response.choices[0].message.content)
    per_member_entries = raw.get("members", [])
    explanation        = raw.get("explanation", "")

    # Resolve each entry to a known member and collect their specific adjustments
    targeted_ids: list[int] = []
    member_adjustments: list[tuple[dict, dict]] = []  # (member, adjustments)

    if not per_member_entries:
        # LLM returned empty — apply nothing
        pass
    else:
        for entry in per_member_entries:
            entry_name  = (entry.get("name") or "").lower().strip()
            adjustments = entry.get("adjustments") or {}
            if not adjustments:
                continue

            # Match by partial name
            matched = next(
                (m for name_key, m in member_index.items() if entry_name in name_key or name_key in entry_name),
                None,
            )
            if matched and matched["consultant_id"] not in targeted_ids:
                targeted_ids.append(matched["consultant_id"])
                member_adjustments.append((matched, adjustments))

    # Fetch project name once — stored on each individual history row so it
    # remains readable even if the project is later renamed.
    project_row = db.query(HRBPProject).filter_by(id=project_id).first()
    project_name = project_row.name if project_row else ""

    all_changes: dict = {}
    # Collect per-member delta results for mirroring to individual history after flush.
    _mirror_rows: list[dict] = []

    for m, adjustments in member_adjustments:
        result = _apply_governance_deltas(db, m["consultant_id"], adjustments)
        if result["changes_detail"]:
            all_changes[str(m["consultant_id"])] = {
                "name":           m["name"],
                "score_before":   result["score_before"],
                "score_after":    result["score_after"],
                "score_delta":    result["score_delta"],
                "changes_detail": result["changes_detail"],
            }
            _mirror_rows.append({
                "consultant_id":  m["consultant_id"],
                "comment":        comment,
                "explanation":    explanation,
                "score_before":   result["score_before"],
                "score_after":    result["score_after"],
                "score_delta":    result["score_delta"],
                "changes_detail": json.dumps(result["changes_detail"]),
                "project_id":     project_id,
                "project_name":   project_name,
                "created_by":     created_by,
            })

    proj_after  = _project_avg_score(db, project_id)
    score_after = proj_after["avg_pct"]

    history = HRBPProjectCommentHistory(
        project_id=project_id,
        comment=comment,
        explanation=explanation,
        targeted_consultant_ids=targeted_ids,
        changes_detail=all_changes,
        score_before=score_before,
        score_after=score_after,
        score_delta=score_after - score_before,
        created_by=created_by,
    )
    db.add(history)
    db.flush()  # project history committed first

    # Mirror to each affected consultant's individual governance history.
    # Uses raw SQL + savepoint so a missing migration never breaks the project save.
    _mirror_sql = _sa_text("""
        INSERT INTO hrbp_governance_comment_history
            (consultant_id, comment, explanation, score_before, score_after,
             score_delta, changes_detail, source, project_id, project_name, created_by)
        VALUES
            (:consultant_id, :comment, :explanation, :score_before, :score_after,
             :score_delta, CAST(:changes_detail AS jsonb), 'project', :project_id, :project_name, :created_by)
    """)
    for row in _mirror_rows:
        try:
            sp = db.begin_nested()
            db.execute(_mirror_sql, row)
            db.flush()
            sp.commit()
        except Exception as exc:
            sp.rollback()
            _log.warning(
                "Could not mirror project comment to individual history "
                "(run migration 037?) consultant=%s err=%s",
                row["consultant_id"], exc,
            )

    return {
        "targeted_count":  len(targeted_ids),
        "targeted_ids":    targeted_ids,
        "adjustments":     {},
        "changes":         all_changes,
        "explanation":     explanation,
        "score_before":    score_before,
        "score_after":     score_after,
        "score_delta":     score_after - score_before,
        "history_id":      history.id,
        "created_at":      history.created_at.isoformat() if history.created_at else None,
    }


def get_comment_history(db: Session, project_id: int) -> list[dict]:
    rows = (
        db.query(HRBPProjectCommentHistory)
        .filter_by(project_id=project_id)
        .order_by(HRBPProjectCommentHistory.created_at.desc())
        .all()
    )
    return [
        {
            "id":                      r.id,
            "project_id":              r.project_id,
            "comment":                 r.comment,
            "explanation":             r.explanation,
            "targeted_consultant_ids": r.targeted_consultant_ids or [],
            "changes_detail":          r.changes_detail or {},
            "score_before":            r.score_before,
            "score_after":             r.score_after,
            "score_delta":             r.score_delta,
            "created_by":              r.created_by,
            "created_at":              r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
