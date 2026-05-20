from infra.models import (
    Assessment,
    AutoRecommendation,
    CallLog,
    Candidate,
    CandidateStatus,
)
from sqlalchemy.orm import Session


def _compute_scores(data: dict) -> dict:
    scores = {}
    r = data.get("resume_skill_score")
    ra = data.get("role_art_score")
    if r is not None and ra is not None:
        scores["tech_score"] = round(0.5 * ((r + ra) / 2), 2)

    comm = data.get("comm_score")
    sa = data.get("self_art_score")
    para = data.get("paraphrase_score")
    conf = data.get("confidence_score")
    soft_vals = [x for x in [comm, sa, para, conf] if x is not None]
    if soft_vals:
        scores["soft_skill_score"] = round(sum(soft_vals) / len(soft_vals), 2)

    ts = scores.get("tech_score")
    ss = scores.get("soft_skill_score")
    if ts is not None and ss is not None:
        overall = round((ts + ss) / 2, 2)
        scores["overall_score"] = overall
        if overall >= 4.0:
            scores["auto_recommendation"] = AutoRecommendation.strong_submit
        elif overall >= 3.25:
            scores["auto_recommendation"] = AutoRecommendation.consider
        else:
            scores["auto_recommendation"] = AutoRecommendation.hold

    if data.get("current_ctc") and data.get("expected_ctc") and data["current_ctc"] > 0:
        scores["hike_pct"] = round(
            ((data["expected_ctc"] - data["current_ctc"]) / data["current_ctc"]) * 100,
            1,
        )
    return scores


def log_call(db: Session, data: dict, caller_id: int) -> CallLog:
    log = CallLog(
        candidate_id=data["candidate_id"],
        caller_id=caller_id,
        outcome=data["outcome"],
        callback_date=data.get("callback_date"),
        notes=data.get("notes"),
    )
    db.add(log)
    candidate = db.query(Candidate).filter(Candidate.id == data["candidate_id"]).first()
    if candidate and candidate.status == CandidateStatus.handed_to_recruiter:
        candidate.status = CandidateStatus.call_in_progress
    db.commit()
    db.refresh(log)
    return log


def upsert_assessment(db: Session, data: dict, caller_id: int) -> Assessment:
    candidate_id = data["candidate_id"]
    submit_for_review = data.pop("submit_for_review", False)
    computed = _compute_scores(data)
    data.update(computed)

    assessment = (
        db.query(Assessment).filter(Assessment.candidate_id == candidate_id).first()
    )
    if assessment:
        for k, v in data.items():
            if k != "candidate_id" and v is not None:
                setattr(assessment, k, v)
    else:
        payload = {
            k: v for k, v in data.items() if v is not None and k != "candidate_id"
        }
        assessment = Assessment(
            candidate_id=candidate_id, caller_id=caller_id, **payload,
        )
        db.add(assessment)

    if submit_for_review:
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if candidate:
            from infra.models import (
                NotifType,
                User,
                UserRole,
                Validation,
                ValidationStatus,
            )

            from features.mrr.notifications.service import push, push_to_role

            # The validator is the JOB's delivery lead. Fall back to min-load
            # allocation only when the job has no DL assigned.
            validator = None
            job = candidate.job
            if job and job.delivery_lead_id:
                validator = (
                    db.query(User)
                    .filter(
                        User.id == job.delivery_lead_id,
                        User.role == UserRole.delivery_lead,
                        User.is_active == True,  # noqa: E712
                    )
                    .first()
                )
            if not validator:
                # Fallback: allocate via the caller's pod (legacy behavior)
                caller = db.query(User).filter(User.id == caller_id).first()
                pod_lead_id = caller.pod_lead_id if caller else None
                if pod_lead_id:
                    from features.mrr.allocation.service import get_min_load

                    validator = get_min_load(db, pod_lead_id, UserRole.delivery_lead)
                    if not validator:
                        validator = (
                            db.query(User)
                            .filter(
                                User.id == pod_lead_id,
                                User.role == UserRole.delivery_lead,
                            )
                            .first()
                        )
            if validator:
                candidate.assigned_validator_id = validator.id

            # If the submitter is also the validator (DL submitting their own
            # call), bypass the validation queue — they've already verified.
            caller_user = db.query(User).filter(User.id == caller_id).first()
            caller_is_dl = bool(
                caller_user and caller_user.role == UserRole.delivery_lead,
            )
            self_validation = (
                caller_is_dl and validator is not None and validator.id == caller_id
            )

            if self_validation:
                candidate.status = CandidateStatus.validated
                # Record an audit-trail Validation row attributed to this DL
                existing_v = (
                    db.query(Validation)
                    .filter(Validation.candidate_id == candidate.id)
                    .first()
                )
                if existing_v:
                    existing_v.status = ValidationStatus.validated
                    existing_v.delivery_lead_id = caller_id
                    existing_v.comments = "Auto-validated — DL sourced and verified the candidate themselves."
                else:
                    db.add(
                        Validation(
                            candidate_id=candidate.id,
                            delivery_lead_id=caller_id,
                            status=ValidationStatus.validated,
                            comments="Auto-validated — DL sourced and verified the candidate themselves.",
                        ),
                    )
                # Notify KAMs so they can Submit to Client
                job_label = f"{job.role_title} ({job.client_name})" if job else ""
                push_to_role(
                    db,
                    UserRole.kam,
                    f"Candidate validated: {candidate.full_name} for {job_label}. Ready to submit to client.",
                    NotifType.candidate_validated,
                    entity_id=candidate.id,
                )
            else:
                candidate.status = CandidateStatus.ready_for_validation
                # Notify the assigned validator (DL)
                target_dl_id = (
                    validator.id
                    if validator
                    else (job.delivery_lead_id if job else None)
                )
                if target_dl_id:
                    push(
                        db,
                        target_dl_id,
                        f"{candidate.full_name} is ready for validation — {job.role_title if job else ''} ({job.client_name if job else ''}). Score: {assessment.overall_score or '—'}",
                        NotifType.ready_for_validation,
                        entity_id=candidate.id,
                    )

    db.commit()
    db.refresh(assessment)
    return assessment


def get_assessment(db: Session, candidate_id: int) -> Assessment | None:
    return db.query(Assessment).filter(Assessment.candidate_id == candidate_id).first()
