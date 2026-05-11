#!/usr/bin/env python3
"""
Seed complete recruiter-story flow data.
Run from backend/: python3 seed_flow.py

Populates:
  - sourcer_ids / caller_ids on real jobs
  - call_logs for candidates
  - consultant_mails (sent, acknowledged, dl_verified)
  - proper statuses + realistic timestamps
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from core.database import SessionLocal
from core.security import hash_password
from infra.models import (
    User, Job, Candidate, CallLog, Assessment, Validation,
    ConsultantMail, Submission, SubmissionTimeline,
    CandidateStatus, ValidationStatus, InterviewStage, CallOutcome,
    RecruiterType, UserRole, JobStatus,
)

db = SessionLocal()

def ts(base: datetime, **delta) -> datetime:
    """Return base + timedelta(**delta), always UTC-aware."""
    t = base + timedelta(**delta)
    return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t

def upsert_mail(candidate_id, sent_by_id, base_sent, hours_ack=4, hours_dl=6, do_ack=True, do_dl=True):
    m = db.query(ConsultantMail).filter(ConsultantMail.candidate_id == candidate_id).first()
    if m:
        db.delete(m); db.flush()
    ack_at = ts(base_sent, hours=hours_ack) if do_ack else None
    dl_at  = ts(base_sent, hours=hours_dl)  if do_dl  else None
    m = ConsultantMail(
        candidate_id=candidate_id,
        sent_by_id=sent_by_id,
        sent_at=base_sent,
        acknowledgement_received=do_ack,
        acknowledgement_at=ack_at,
        dl_verified=do_dl,
        dl_verified_at=dl_at,
    )
    db.add(m); db.flush()
    return m

def upsert_validation(candidate_id, dl_id, status, validated_at, comments=None):
    v = db.query(Validation).filter(Validation.candidate_id == candidate_id).first()
    if v:
        v.status = status; v.delivery_lead_id = dl_id
        v.comments = comments; v.updated_at = validated_at
    else:
        v = Validation(
            candidate_id=candidate_id, delivery_lead_id=dl_id,
            status=status, comments=comments,
            created_at=validated_at, updated_at=validated_at,
        )
        db.add(v)
    db.flush(); return v

def upsert_submission(candidate_id, job_id, dl_id, submitted_at, stage):
    s = db.query(Submission).filter(Submission.candidate_id == candidate_id).first()
    if s:
        s.current_stage = stage; s.submitted_at = submitted_at
        s.delivery_lead_id = dl_id
    else:
        s = Submission(
            candidate_id=candidate_id, job_id=job_id,
            delivery_lead_id=dl_id, submitted_at=submitted_at,
            current_stage=stage,
        )
        db.add(s)
    db.flush(); return s

def set_assessment(candidate_id, caller_id, assessed_at, score):
    a = db.query(Assessment).filter(Assessment.candidate_id == candidate_id).first()
    if a:
        a.overall_score = score; a.caller_id = caller_id
        a.updated_at = assessed_at
    else:
        a = Assessment(
            candidate_id=candidate_id, caller_id=caller_id,
            overall_score=score, pass_to_validation="Yes",
            comm_score=score, created_at=assessed_at, updated_at=assessed_at,
        )
        db.add(a)
    db.flush(); return a

def add_call_log(candidate_id, caller_id, call_at, outcome="5_10min", notes="Positive call"):
    existing = db.query(CallLog).filter(CallLog.candidate_id == candidate_id).first()
    if existing: return existing
    log = CallLog(
        candidate_id=candidate_id, caller_id=caller_id,
        call_date=call_at, outcome=outcome, notes=notes,
        created_at=call_at,
    )
    db.add(log); db.flush(); return log

print("Loading users and jobs…")

# ── Key users ─────────────────────────────────────────────────────────────────
admin    = db.query(User).filter(User.email == "admin@j2w.com").first()
kam      = db.query(User).filter(User.email == "priya@j2w.com").first()
dl       = db.query(User).filter(User.email == "dl@j2w.com").first()
shwetha  = db.query(User).filter(User.email == "shwetha@j2w.com").first()    # both
gagana   = db.query(User).filter(User.email == "gagana@j2w.com").first()     # sourcer
nithish  = db.query(User).filter(User.email == "nithish@j2w.com").first()    # sourcer
prathik  = db.query(User).filter(User.email == "prathik@j2w.com").first()    # caller
ravi     = db.query(User).filter(User.email == "ravi@j2w.com").first()       # caller

if not all([kam, dl, shwetha, gagana, nithish, prathik, ravi]):
    print("ERROR: seed users not found. Run the app first to trigger seed_data().")
    sys.exit(1)

# Ensure recruiter_types are correct
for u, rt in [(shwetha, "both"), (gagana, "sourcer"), (nithish, "sourcer"),
              (prathik, "caller"), (ravi, "caller")]:
    u.recruiter_type = rt
db.flush()

# ── Fix jobs: assign sourcer_ids + caller_ids + confirmed_at ─────────────────
import json as _json

# Job assignments: job_id -> (sourcer_ids, caller_ids)
JOB_ASSIGN = {
    1: ([gagana.id], [prathik.id]),        # ML Engineer @ Sony
    2: ([nithish.id], [ravi.id]),          # Backend Engineer @ Sony
    3: ([shwetha.id], [ravi.id]),          # Data Engineer @ GEHC
    4: ([gagana.id, nithish.id], [prathik.id, shwetha.id]),  # Full Stack @ Flipkart
    5: ([nithish.id], [ravi.id, prathik.id]),  # DevOps @ JLL
    6: ([shwetha.id], [ravi.id, shwetha.id]),  # AI Engineer @ GEHC
}

BASE_DATE = datetime(2026, 4, 1, 9, 0, 0, tzinfo=timezone.utc)  # April 1 — JD upload day

for job_id, (s_ids, c_ids) in JOB_ASSIGN.items():
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job: continue
    job.sourcer_ids = _json.dumps(s_ids)
    job.caller_ids  = _json.dumps(c_ids)
    job.assigned_sourcer_id = s_ids[0] if s_ids else None
    job.assigned_caller_id  = c_ids[0] if c_ids else None
    job.delivery_lead_id = dl.id
    job.created_by_id    = kam.id
    # JD uploaded on April 1, DL confirmed 4 hours later
    job.created_at = BASE_DATE + timedelta(hours=(job_id - 1) * 6)
    job.updated_at = job.created_at + timedelta(hours=4)   # confirmed timestamp
    job.status     = JobStatus.open
db.commit()
print("✓ Jobs updated with sourcer/caller assignments")

# ── Full pipeline for each candidate ─────────────────────────────────────────
# Map: candidate_id -> (sourcer_id, caller_id, days_offset, score, stage, do_mail, do_ack, do_dl, final_status)
# days_offset: days after JD creation the candidate was sourced

CANDIDATE_FLOW = {
    # Job 1 – ML Engineer @ Sony (3 cands)
    1:  (gagana.id,  prathik.id, 2, 4.22, InterviewStage.joined,        True,  True,  True,  CandidateStatus.joined),
    2:  (gagana.id,  prathik.id, 3, 4.15, InterviewStage.l2_cleared,    True,  True,  True,  CandidateStatus.interview_stage),
    4:  (gagana.id,  ravi.id,    4, 3.55, None,                          True,  False, False, CandidateStatus.ready_for_validation),

    # Job 2 – Backend Engineer @ Sony
    5:  (nithish.id, ravi.id,    2, 4.05, InterviewStage.hm_review,     True,  True,  True,  CandidateStatus.submitted_to_client),
    6:  (nithish.id, prathik.id, 3, 3.34, None,                          False, False, False, CandidateStatus.ready_for_validation),

    # Job 3 – Data Engineer @ GEHC
    7:  (shwetha.id, ravi.id,    2, 4.49, InterviewStage.offer_rolled_out, True, True, True, CandidateStatus.offer_rolled_out),
    8:  (shwetha.id, ravi.id,    3, 4.05, InterviewStage.l1_cleared,    True,  True,  True,  CandidateStatus.interview_stage),
    9:  (shwetha.id, prathik.id, 4, 4.00, InterviewStage.submitted,     True,  True,  True,  CandidateStatus.submitted_to_client),
    10: (gagana.id,  ravi.id,    5, 3.20, None,                          False, False, False, CandidateStatus.call_in_progress),

    # Job 4 – Full Stack @ Flipkart
    11: (gagana.id,  prathik.id, 2, 4.30, InterviewStage.final_cleared,  True,  True, True,  CandidateStatus.interview_stage),
    12: (nithish.id, shwetha.id, 3, 3.90, InterviewStage.l1_scheduled,  True,  True,  True,  CandidateStatus.submitted_to_client),
    13: (gagana.id,  ravi.id,    4, 3.60, None,                          True,  False, False, CandidateStatus.ready_for_validation),
    14: (nithish.id, None,       5, None, None,                          False, False, False, CandidateStatus.sourced),

    # Job 5 – DevOps @ JLL
    15: (nithish.id, ravi.id,    2, 4.10, InterviewStage.l1_scheduled,  True,  True,  True,  CandidateStatus.submitted_to_client),
    16: (nithish.id, shwetha.id, 3, 4.00, None,                          True,  True,  False, CandidateStatus.validated),
    17: (gagana.id,  ravi.id,    4, 3.70, None,                          False, False, False, CandidateStatus.call_in_progress),
    18: (nithish.id, None,       5, None, None,                          False, False, False, CandidateStatus.pool_verified),
    19: (gagana.id,  prathik.id, 6, None, None,                          False, False, False, CandidateStatus.handed_to_recruiter),
    20: (nithish.id, shwetha.id, 4, 3.40, None,                          False, False, False, CandidateStatus.needs_rework),
}

for cand_id, (src_id, caller_id, day_off, score, stage, do_mail, do_ack, do_dl, final_status) in CANDIDATE_FLOW.items():
    c = db.query(Candidate).filter(Candidate.id == cand_id).first()
    if not c: continue

    job = db.query(Job).filter(Job.id == c.job_id).first()
    job_base = job.created_at if job and job.created_at else BASE_DATE

    # Timestamps
    sourced_at   = ts(job_base, days=day_off, hours=1)
    called_at    = ts(sourced_at, hours=6)
    assessed_at  = ts(called_at, hours=3)
    mail_sent_at = ts(assessed_at, days=1, hours=2)

    # Update candidate
    c.sourced_at    = sourced_at
    c.sourced_by_id = src_id
    if caller_id:
        c.assigned_to_id = caller_id
    c.status = final_status

    # Call log
    if caller_id:
        add_call_log(cand_id, caller_id, called_at, outcome="5_10min", notes="Profile matches JD requirements")

    # Assessment
    if score is not None:
        set_assessment(cand_id, caller_id or src_id, assessed_at, score)

    # Consultant mail
    if do_mail:
        upsert_mail(cand_id, src_id, mail_sent_at, hours_ack=5, hours_dl=8, do_ack=do_ack, do_dl=do_dl)

    # Validation
    if stage is not None or final_status in (
        CandidateStatus.validated, CandidateStatus.submitted_to_client,
        CandidateStatus.interview_stage, CandidateStatus.offer_rolled_out,
        CandidateStatus.joined,
    ):
        validated_at = ts(mail_sent_at, hours=10)
        upsert_validation(cand_id, dl.id, ValidationStatus.validated, validated_at,
                          comments="Profile reviewed and approved for submission")
        if stage is not None:
            submitted_at = ts(validated_at, hours=6)
            upsert_submission(cand_id, c.job_id, kam.id, submitted_at, stage)

    elif final_status == CandidateStatus.needs_rework:
        validated_at = ts(mail_sent_at, hours=10)
        upsert_validation(cand_id, dl.id, ValidationStatus.needs_review, validated_at,
                          comments="Please update CTC expectation details")

db.commit()
print("✓ All candidate pipelines seeded with realistic timestamps")

# ── Rejected candidate example (candidate 3 if exists) ───────────────────────
c3 = db.query(Candidate).filter(Candidate.id == 3).first()
if c3:
    c3.status           = CandidateStatus.rejected
    c3.rejected_by      = "KAM: Priya Sharma"
    c3.rejection_reason = "CTC expectation (₹28L) exceeds client budget (max ₹22L)"
    c3.sourced_by_id    = nithish.id
    c3.assigned_to_id   = prathik.id
    c3.sourced_at       = ts(BASE_DATE, days=2, hours=2)
    job3 = db.query(Job).filter(Job.id == c3.job_id).first()
    called_at   = ts(c3.sourced_at, hours=5)
    assessed_at = ts(called_at, hours=3)
    mail_at     = ts(assessed_at, days=1)
    add_call_log(c3.id, prathik.id, called_at, "5_10min", "Profile good but CTC high")
    set_assessment(c3.id, prathik.id, assessed_at, 4.66)
    upsert_mail(c3.id, nithish.id, mail_at, do_ack=True, do_dl=True)
    validated_at = ts(mail_at, hours=8)
    upsert_validation(c3.id, dl.id, ValidationStatus.validated, validated_at, "Approved")
    submitted_at = ts(validated_at, hours=4)
    upsert_submission(c3.id, c3.job_id, kam.id, submitted_at, InterviewStage.submitted)
    db.commit()
    print("✓ Candidate 3 marked as KAM-rejected with full trail")

print("\n✅ Seed complete. Refresh the Recruiter Story page.")
db.close()
