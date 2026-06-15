import json
import math
import re

from openai import OpenAI
from sqlalchemy.orm import Session

from core.config import settings
from features.hrbp.governance.constants import CATEGORY_MAP, GOVERNANCE_CATEGORIES, TOTAL_MAX_SCORE
from infra.hrbp_models import HRBPGovernanceCommentHistory, HRBPGovernanceCustomCategory, HRBPGovernanceScore


# ── Helpers ───────────────────────────────────────────────────────────────────

def _calc_escalation_deduction(escalations: int, base: int) -> int:
    if escalations == 0:
        return 0
    elif escalations == 1:
        return base
    elif escalations == 2:
        return math.floor(base * 1.5)
    else:
        return base * 2


def _calc_net_score(options: list, option_index: int, escalations: int, escalation_base: int) -> int:
    base = options[option_index]["score"]
    deduction = _calc_escalation_deduction(escalations, escalation_base)
    return max(0, base - deduction)


def _get_grade(score: int, total: int) -> tuple[str, str]:
    pct = (score / total * 100) if total else 0
    if pct >= 90:
        return "Excellent", "success"
    elif pct >= 75:
        return "Good", "info"
    elif pct >= 55:
        return "Average", "warning"
    elif pct >= 35:
        return "Below Average", "danger"
    else:
        return "Critical", "critical"


def _auto_generate_options(max_score: int) -> list:
    labels = [
        "Excellent — consistently exceeds expectations",
        "Good — meets expectations with minor gaps",
        "Average — meets basic expectations",
        "Below average — needs improvement",
        "Poor — consistently underperforms",
    ]
    scores = [
        max_score,
        max(0, round(max_score * 0.75)),
        max(0, round(max_score * 0.50)),
        max(0, round(max_score * 0.25)),
        0,
    ]
    return [{"index": i, "label": labels[i], "score": scores[i]} for i in range(5)]


def _make_custom_key(label: str, consultant_id: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:30]
    return f"custom_{slug}_{consultant_id}"


def _get_custom_categories(db: Session, consultant_id: int) -> list[HRBPGovernanceCustomCategory]:
    return (
        db.query(HRBPGovernanceCustomCategory)
        .filter(HRBPGovernanceCustomCategory.consultant_id == consultant_id)
        .all()
    )


def _build_category_lookup(db: Session, consultant_id: int) -> dict:
    """Returns a unified map of all categories (default + custom) for this consultant."""
    lookup = dict(CATEGORY_MAP)
    for cc in _get_custom_categories(db, consultant_id):
        lookup[cc.key] = {
            "key": cc.key,
            "label": cc.label,
            "max_score": cc.max_score,
            "escalation_base": cc.escalation_base,
            "description": cc.description,
            "options": cc.options,
            "is_custom": True,
        }
    return lookup


# ── Core: auto-init scores ────────────────────────────────────────────────────

def get_or_init_scores(db: Session, consultant_id: int) -> list[HRBPGovernanceScore]:
    """Create missing default score rows; never recreate rows that exist (even if inactive)."""
    existing = (
        db.query(HRBPGovernanceScore)
        .filter(HRBPGovernanceScore.consultant_id == consultant_id)
        .all()
    )
    existing_keys = {s.category_key for s in existing}

    for cat in GOVERNANCE_CATEGORIES:
        if cat["key"] not in existing_keys:
            net = cat["options"][0]["score"]
            db.add(HRBPGovernanceScore(
                consultant_id=consultant_id,
                category_key=cat["key"],
                option_index=0,
                escalations=0,
                net_score=net,
                is_active=True,
            ))
    db.flush()

    return (
        db.query(HRBPGovernanceScore)
        .filter(HRBPGovernanceScore.consultant_id == consultant_id)
        .all()
    )


def get_score_summary(db: Session, consultant_id: int) -> dict:
    all_scores = get_or_init_scores(db, consultant_id)
    cat_lookup = _build_category_lookup(db, consultant_id)
    active = [s for s in all_scores if s.is_active]
    total = sum(s.net_score for s in active)
    total_possible = sum(
        cat_lookup[s.category_key]["max_score"]
        for s in active
        if s.category_key in cat_lookup
    )
    grade, tone = _get_grade(total, total_possible or TOTAL_MAX_SCORE)
    return {
        "consultant_id": consultant_id,
        "total_score": total,
        "total_possible": total_possible,
        "grade": grade,
        "tone": tone,
    }


def get_full_scores(db: Session, consultant_id: int) -> dict:
    """Returns active scores + list of inactive default category keys (for restore UI)."""
    all_scores = get_or_init_scores(db, consultant_id)
    cat_lookup = _build_category_lookup(db, consultant_id)

    active_entries = []
    inactive_default_keys = []

    for s in all_scores:
        cat = cat_lookup.get(s.category_key)
        if not cat:
            continue
        if not s.is_active:
            # Only track inactive DEFAULT categories (custom ones are just gone)
            if s.category_key in CATEGORY_MAP:
                inactive_default_keys.append({
                    "key": s.category_key,
                    "label": cat["label"],
                    "max_score": cat["max_score"],
                })
            continue

        base = cat["options"][s.option_index]["score"]
        active_entries.append({
            "category_key": s.category_key,
            "category_label": cat["label"],
            "option_index": s.option_index,
            "option_label": cat["options"][s.option_index]["label"],
            "escalations": s.escalations,
            "base_score": base,
            "net_score": s.net_score,
            "max_score": cat["max_score"],
            "options": cat["options"],
            "is_custom": cat.get("is_custom", False),
        })

    # Keep default order first, then custom
    default_order = [c["key"] for c in GOVERNANCE_CATEGORIES]
    active_entries.sort(
        key=lambda x: default_order.index(x["category_key"])
        if x["category_key"] in default_order
        else 999
    )

    total = sum(e["net_score"] for e in active_entries)
    total_possible = sum(e["max_score"] for e in active_entries)
    grade, tone = _get_grade(total, total_possible or 1)

    return {
        "scores": active_entries,
        "inactive_defaults": inactive_default_keys,
        "summary": {
            "consultant_id": consultant_id,
            "total_score": total,
            "total_possible": total_possible,
            "grade": grade,
            "tone": tone,
        },
    }


# ── Category management ───────────────────────────────────────────────────────

def deactivate_category(db: Session, consultant_id: int, category_key: str) -> None:
    row = (
        db.query(HRBPGovernanceScore)
        .filter_by(consultant_id=consultant_id, category_key=category_key)
        .first()
    )
    if not row:
        raise ValueError(f"Category '{category_key}' not found for this consultant")
    row.is_active = False
    db.flush()


def restore_category(db: Session, consultant_id: int, category_key: str) -> None:
    if category_key not in CATEGORY_MAP:
        raise ValueError(f"'{category_key}' is not a default category and cannot be restored")
    row = (
        db.query(HRBPGovernanceScore)
        .filter_by(consultant_id=consultant_id, category_key=category_key)
        .first()
    )
    if not row:
        raise ValueError(f"Category '{category_key}' row not found")
    row.is_active = True
    db.flush()


def add_custom_category(
    db: Session,
    consultant_id: int,
    label: str,
    max_score: int,
    description: str = "",
) -> dict:
    key = _make_custom_key(label, consultant_id)

    # Prevent duplicates
    existing = (
        db.query(HRBPGovernanceCustomCategory)
        .filter_by(consultant_id=consultant_id, key=key)
        .first()
    )
    if existing:
        raise ValueError(f"A custom category '{label}' already exists for this consultant")

    options = _auto_generate_options(max_score)
    escalation_base = max(1, max_score // 5)

    cc = HRBPGovernanceCustomCategory(
        consultant_id=consultant_id,
        key=key,
        label=label,
        max_score=max_score,
        escalation_base=escalation_base,
        description=description,
        options=options,
    )
    db.add(cc)
    db.flush()

    score_row = HRBPGovernanceScore(
        consultant_id=consultant_id,
        category_key=key,
        option_index=0,
        escalations=0,
        net_score=max_score,
        is_active=True,
    )
    db.add(score_row)
    db.flush()

    return {"key": key, "label": label, "max_score": max_score, "options": options}


def delete_custom_category(db: Session, consultant_id: int, category_key: str) -> None:
    if not category_key.startswith("custom_"):
        raise ValueError("Only custom categories can be permanently deleted")
    # Remove score row
    score_row = (
        db.query(HRBPGovernanceScore)
        .filter_by(consultant_id=consultant_id, category_key=category_key)
        .first()
    )
    if score_row:
        db.delete(score_row)
    # Remove custom category definition
    cc = (
        db.query(HRBPGovernanceCustomCategory)
        .filter_by(consultant_id=consultant_id, key=category_key)
        .first()
    )
    if cc:
        db.delete(cc)
    db.flush()


# ── Manual score update ───────────────────────────────────────────────────────

def update_scores_manual(db: Session, consultant_id: int, payload: dict) -> dict:
    cat_lookup = _build_category_lookup(db, consultant_id)
    score_rows = {
        s.category_key: s
        for s in (
            db.query(HRBPGovernanceScore)
            .filter(HRBPGovernanceScore.consultant_id == consultant_id, HRBPGovernanceScore.is_active == True)
            .all()
        )
    }
    for cat_key, vals in payload.items():
        cat = cat_lookup.get(cat_key)
        row = score_rows.get(cat_key)
        if not cat or not row:
            continue
        opt_idx = max(0, min(4, int(vals.get("option_index", row.option_index))))
        escs = max(0, min(3, int(vals.get("escalations", row.escalations))))
        row.option_index = opt_idx
        row.escalations = escs
        row.net_score = _calc_net_score(cat["options"], opt_idx, escs, cat["escalation_base"])
    db.flush()
    return get_score_summary(db, consultant_id)


# ── AI comment analysis ────────────────────────────────────────────────────────

def _build_prompt(
    consultant_name: str,
    comment: str,
    score_rows: dict[str, HRBPGovernanceScore],
    cat_lookup: dict,
) -> tuple[str, str]:
    system_prompt = (
        "You are an HR governance analyst reviewing a manager's observation about a consultant.\n\n"
        "SCORING SCALE: 0 = BEST performance, 4 = WORST performance.\n"
        "  Positive behaviour / improvement / praise   → suggest a LOWER level (toward 0)\n"
        "  Negative behaviour / complaint / failure    → suggest a HIGHER level (toward 4)\n"
        "  Unclear, neutral, or unrelated to category  → OMIT that category entirely\n\n"
        "MANDATORY RULES — you must follow every one of these:\n"
        "1. Only include a category if the comment DIRECTLY and EXPLICITLY describes behaviour "
        "that belongs to that specific category. Do not infer or assume connections.\n"
        "2. If you are not fully certain whether a comment is positive or negative for a "
        "category, OMIT that category. Never guess the direction.\n"
        "3. NEVER increase a category level (move toward 4 / worse) unless the comment "
        "clearly and unambiguously describes a problem, failure, or complaint for that exact "
        "category. Vague or ambiguous language is NOT enough — omit it.\n"
        "4. Each category is independent. Mentioning behaviour for one category must NOT "
        "cause changes in other categories unless those others are explicitly mentioned.\n"
        "5. Generic phrases such as 'doing well', 'good work', 'performing fine', or "
        "'no issues' without specifics may ONLY improve Performance or Conduct at most — "
        "never other categories unless explicitly stated.\n"
        "6. If the comment contains no clear, category-specific, unambiguous behaviour, "
        "return an empty adjustments object.\n\n"
        "Respond ONLY with valid JSON (no markdown, no extra text):\n"
        "{\"adjustments\": {\"<category_key>\": <integer 0-4>}, "
        "\"explanation\": \"<one concise sentence per changed category, "
        "or 'No category-specific behaviour identified.' if adjustments is empty>\"}"
    )

    matrix_lines = []
    for cat_key, cat in cat_lookup.items():
        row = score_rows.get(cat_key)
        if not row or not row.is_active:
            continue
        cur_idx = row.option_index
        cur_escs = row.escalations
        esc_deg = min(cur_escs, 2)
        effective_idx = min(4, cur_idx + esc_deg)

        options_text = "\n".join(
            f"    {o['index']}  \"{o['label']}\"  ({o['score']}/{cat['max_score']} pts)"
            + (" [◀ CURRENT]" if o["index"] == effective_idx else "")
            for o in cat["options"]
        )
        matrix_lines.append(
            f"[{cat_key}] {cat['label']} (max {cat['max_score']} pts)\n"
            f"  Description: {cat.get('description', '')}\n"
            f"  Levels (0=BEST → 4=WORST):\n{options_text}"
        )

    user_prompt = (
        f"Consultant: {consultant_name}\n"
        f"Manager observation: \"{comment}\"\n\n"
        f"Active scoring matrix (levels 0=BEST → 4=WORST):\n"
        + "\n\n".join(matrix_lines)
        + "\n\nAnalyse the observation strictly against the rules above. "
        "Include only categories with direct, unambiguous evidence in the comment. "
        "If the comment is vague, neutral, or cannot be confidently classified for a category, "
        "return an empty adjustments object."
    )
    return system_prompt, user_prompt


def analyze_comment(
    db: Session,
    consultant_id: int,
    comment: str,
    consultant_name: str,
    created_by: int,
) -> dict:
    if not settings.open_ai_key:
        raise ValueError("OPEN_AI_KEY is not configured")

    cat_lookup = _build_category_lookup(db, consultant_id)
    all_score_rows = get_or_init_scores(db, consultant_id)
    score_rows = {s.category_key: s for s in all_score_rows}
    active_rows = {k: v for k, v in score_rows.items() if v.is_active}
    score_before = sum(s.net_score for s in active_rows.values())

    system_prompt, user_prompt = _build_prompt(consultant_name, comment, score_rows, cat_lookup)

    client = OpenAI(api_key=settings.open_ai_key)
    response = client.chat.completions.create(
        model=settings.open_ai_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.0,
        max_tokens=1000,
    )
    raw = json.loads(response.choices[0].message.content)
    ai_adjustments: dict = raw.get("adjustments", {})
    explanation: str = raw.get("explanation", "")

    validated: dict[str, int] = {}
    esc_adjustments: dict[str, int] = {}
    changes_detail: dict = {}

    for cat_key, new_idx in ai_adjustments.items():
        cat = cat_lookup.get(cat_key)
        if not cat:
            continue
        try:
            new_idx = int(new_idx)
        except (TypeError, ValueError):
            continue
        new_idx = max(0, min(4, new_idx))

        row = score_rows.get(cat_key)
        if not row or not row.is_active:
            continue
        cur_idx = row.option_index
        cur_escs = row.escalations
        esc_deg = min(cur_escs, 2)
        effective_idx = min(4, cur_idx + esc_deg)

        new_idx = max(effective_idx - 2, min(effective_idx + 2, new_idx))
        if new_idx == effective_idx:
            continue

        actual_new_idx = new_idx
        is_improvement = new_idx < effective_idx
        if is_improvement and actual_new_idx == cur_idx and cur_escs > 0:
            esc_adjustments[cat_key] = -1
            actual_new_idx = cur_idx
        elif not is_improvement:
            actual_new_idx = min(4, new_idx)

        validated[cat_key] = actual_new_idx

        from_opt = cat["options"][cur_idx]
        to_opt = cat["options"][actual_new_idx]
        esc_deduct = _calc_escalation_deduction(cur_escs, cat["escalation_base"])
        net_before = max(0, from_opt["score"] - esc_deduct)
        net_after = max(0, to_opt["score"] - esc_deduct)
        changes_detail[cat_key] = {
            "category_label": cat["label"],
            "max_score": cat["max_score"],
            "from_idx": cur_idx,
            "to_idx": actual_new_idx,
            "from_label": from_opt["label"],
            "to_label": to_opt["label"],
            "from_score": net_before,
            "to_score": net_after,
            "score_diff": net_after - net_before,
        }

    for cat_key, new_idx in validated.items():
        row = score_rows[cat_key]
        cat = cat_lookup[cat_key]
        esc_adj = esc_adjustments.get(cat_key, 0)
        new_escs = max(0, min(3, row.escalations + esc_adj))
        row.option_index = new_idx
        row.escalations = new_escs
        row.net_score = _calc_net_score(cat["options"], new_idx, new_escs, cat["escalation_base"])

    score_after = sum(s.net_score for s in active_rows.values())
    score_delta = score_after - score_before

    history = HRBPGovernanceCommentHistory(
        consultant_id=consultant_id,
        comment=comment,
        explanation=explanation,
        score_before=score_before,
        score_after=score_after,
        score_delta=score_delta,
        changes_detail=changes_detail,
        created_by=created_by,
    )
    db.add(history)
    db.flush()

    return {
        "adjustments": validated,
        "esc_adjustments": esc_adjustments,
        "changes_detail": changes_detail,
        "explanation": explanation,
        "score_before": score_before,
        "score_after": score_after,
        "score_delta": score_delta,
        "history_id": history.id,
        "created_at": history.created_at.isoformat() if history.created_at else None,
    }


def get_comment_history(db: Session, consultant_id: int) -> list[dict]:
    rows = (
        db.query(HRBPGovernanceCommentHistory)
        .filter(HRBPGovernanceCommentHistory.consultant_id == consultant_id)
        .order_by(HRBPGovernanceCommentHistory.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "consultant_id": r.consultant_id,
            "comment": r.comment,
            "explanation": r.explanation,
            "score_before": r.score_before,
            "score_after": r.score_after,
            "score_delta": r.score_delta,
            "changes_detail": r.changes_detail or {},
            "created_by": r.created_by,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
