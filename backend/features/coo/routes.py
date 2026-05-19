from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import require_roles
from infra.models import Submission, SubmissionTimeline, Candidate, Job, User

router = APIRouter(prefix="/coo", tags=["coo"])

# Stage buckets → leaderboard columns
SCREEN_REJECT = {"ta_rejected", "hm_rejected"}
L1_REJECT     = {"l1_rejected"}
L1_ACCEPT     = {"l1_cleared"}
L2_REJECT     = {"l2_rejected"}
L2_ACCEPT     = {"l2_cleared"}
L3_REJECT     = {"final_rejected"}
L3_ACCEPT     = {"final_cleared"}
SELECTION     = {"offer_accepted", "offer_rolled_out"}
ONBOARDING    = {"joined"}


def _day_bounds(days_ago: int):
    """Return (start, end) UTC datetimes for a day offset from today."""
    now   = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago)
    end   = start + timedelta(days=1)
    return start, end


def _in_day(dt: datetime | None, start: datetime, end: datetime) -> bool:
    if dt is None:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return start <= dt < end


def _empty_row():
    cols = ["submission", "screen_reject", "l1_reject", "l1_accept",
            "l2_reject", "l2_accept", "l3_reject", "l3_accept",
            "selection", "onboarding"]
    return {c: {"yesterday": 0, "today": 0} for c in cols}


@router.get("/leaderboard")
def coo_leaderboard(
    db: Session = Depends(get_db),
    _=Depends(require_roles("coo", "admin")),
):
    """
    Returns per-KAM, per-client pipeline counts split into Today and Yesterday.
    Columns: submission, screen_reject, l1_reject, l1_accept, l2_reject, l2_accept,
             l3_reject, l3_accept, selection, onboarding.
    """
    today_start,     today_end     = _day_bounds(0)
    yesterday_start, yesterday_end = _day_bounds(1)

    # Load all submissions with joins
    subs = (
        db.query(Submission)
        .join(Candidate, Submission.candidate_id == Candidate.id)
        .join(Job, Submission.job_id == Job.id)
        .all()
    )

    # Collect timeline entries keyed by submission_id
    timelines: dict[int, list[SubmissionTimeline]] = {}
    for t in db.query(SubmissionTimeline).all():
        timelines.setdefault(t.submission_id, []).append(t)

    # KAM name lookup
    kam_names: dict[int, str] = {
        u.id: u.name
        for u in db.query(User).all()
    }

    # Aggregate: key = (kam_name, client_name)
    agg: dict[tuple[str, str], dict] = {}

    for sub in subs:
        cand = sub.candidate
        if not cand or not cand.job:
            continue
        job = cand.job
        kam_name    = kam_names.get(job.created_by_id, "—")
        client_name = job.client_name or "—"
        key = (kam_name, client_name)
        if key not in agg:
            agg[key] = _empty_row()
        row = agg[key]

        # Submission
        if _in_day(sub.submitted_at, today_start, today_end):
            row["submission"]["today"] += 1
        elif _in_day(sub.submitted_at, yesterday_start, yesterday_end):
            row["submission"]["yesterday"] += 1

        # Timeline stage counts
        for t in timelines.get(sub.id, []):
            ca = t.created_at
            is_today     = _in_day(ca, today_start,     today_end)
            is_yesterday = _in_day(ca, yesterday_start, yesterday_end)
            if not is_today and not is_yesterday:
                continue
            period = "today" if is_today else "yesterday"
            s = t.stage
            if s in SCREEN_REJECT: row["screen_reject"][period] += 1
            elif s in L1_REJECT:   row["l1_reject"][period]     += 1
            elif s in L1_ACCEPT:   row["l1_accept"][period]     += 1
            elif s in L2_REJECT:   row["l2_reject"][period]     += 1
            elif s in L2_ACCEPT:   row["l2_accept"][period]     += 1
            elif s in L3_REJECT:   row["l3_reject"][period]     += 1
            elif s in L3_ACCEPT:   row["l3_accept"][period]     += 1
            elif s in SELECTION:   row["selection"][period]     += 1
            elif s in ONBOARDING:  row["onboarding"][period]    += 1

    # Build sorted list: sort by KAM name, then client name
    rows = [
        {"kam_name": kam, "client_name": client, **data}
        for (kam, client), data in sorted(agg.items())
    ]
    return {"rows": rows}
