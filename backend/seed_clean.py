#!/usr/bin/env python3
"""
Full clean seed — wipes all data except users, then seeds a realistic full pipeline.
Run from backend/: python3 seed_clean.py
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from core.database import SessionLocal
from infra.models import (
    User, Job, Candidate, CallLog, Assessment, Validation,
    ConsultantMail, Submission, SubmissionTimeline,
    BusinessHead, Client,
    CandidateStatus, ValidationStatus, InterviewStage,
    CallOutcome, UserRole, JobStatus, WorkMode, RecruiterType,
)
from core.security import hash_password

db = SessionLocal()

# ── 1. Clean all data (FK-safe order) ────────────────────────────────────────
print("Cleaning existing data…")
tables = [
    "submission_timeline", "submissions", "validations", "consultant_mails",
    "call_logs", "assessments", "consultant_profiles", "candidates",
    "jobs", "clients", "account_managers", "notifications",
]
for t in tables:
    try:
        db.execute(text(f"DELETE FROM {t}"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"  skip {t}: {e}")

# Reset sequences
seqs = ["jobs_id_seq", "candidates_id_seq", "call_logs_id_seq", "assessments_id_seq",
        "validations_id_seq", "consultant_mails_id_seq", "submissions_id_seq",
        "submission_timeline_id_seq", "account_managers_id_seq", "clients_id_seq"]
for s in seqs:
    try:
        db.execute(text(f"ALTER SEQUENCE {s} RESTART WITH 1"))
        db.commit()
    except Exception:
        db.rollback()

# Remove test users (id >= 10), keep real team
try:
    db.execute(text("DELETE FROM users WHERE id >= 10"))
    db.commit()
except Exception:
    db.rollback()

# Set correct recruiter types
RECRUITER_TYPES = {
    4: "both",    # Shwetha R
    5: "sourcer", # Gagana M
    6: "sourcer", # Nithish S
    7: "caller",  # Prathik K
    8: "caller",  # Ravi Kumar
    9: "sourcer", # Subhashree P
}
for uid, rt in RECRUITER_TYPES.items():
    db.execute(text("UPDATE users SET recruiter_type=:rt, pod_lead_id=3 WHERE id=:id"), {"rt": rt, "id": uid})
# Also add Rakshith B if missing
db.execute(text("""
    INSERT INTO users (name, email, password_hash, role, recruiter_type, pod_lead_id, is_active)
    VALUES ('Rakshith B', 'rakshith@j2w.com', :ph, 'recruiter', 'caller', 3, true)
    ON CONFLICT (email) DO UPDATE SET recruiter_type='caller', pod_lead_id=3
"""), {"ph": hash_password("rec123")})
db.commit()
print("✓ Users cleaned and types set")

# Reload users
admin    = db.query(User).filter(User.email == "admin@j2w.com").first()
kam      = db.query(User).filter(User.email == "priya@j2w.com").first()
dl       = db.query(User).filter(User.email == "dl@j2w.com").first()
shwetha  = db.query(User).filter(User.email == "shwetha@j2w.com").first()
gagana   = db.query(User).filter(User.email == "gagana@j2w.com").first()
nithish  = db.query(User).filter(User.email == "nithish@j2w.com").first()
prathik  = db.query(User).filter(User.email == "prathik@j2w.com").first()
ravi     = db.query(User).filter(User.email == "ravi@j2w.com").first()
subhashree = db.query(User).filter(User.email == "subhashree@j2w.com").first()
rakshith = db.query(User).filter(User.email == "rakshith@j2w.com").first()

# ── 2. Business Heads ─────────────────────────────────────────────────────────
print("Creating business heads…")
bh1 = BusinessHead(name="Arun Menon",   email="arun.menon@j2w.com",   phone="9844001122")
bh2 = BusinessHead(name="Sneha Rao",    email="sneha.rao@j2w.com",    phone="9844003344")
bh3 = BusinessHead(name="Vikram Iyer",  email="vikram.iyer@j2w.com",  phone="9844005566")
db.add_all([bh1, bh2, bh3]); db.flush()

# ── 3. Clients ────────────────────────────────────────────────────────────────
print("Creating clients…")
clients_data = [
    ("GE Healthcare (GEHC)", "GEHC", "https://www.gehealthcare.com", "Global medical tech leader"),
    ("JLL India",             "JLL",  "https://www.jll.co.in",        "Commercial real estate & services"),
    ("Analog Devices India",  "ADI",  "https://www.analog.com",       "Semiconductor & embedded solutions"),
    ("Sony India",            "Sony", "https://www.sony.co.in",       "Consumer electronics & entertainment"),
    ("Flipkart",              "FK",   "https://www.flipkart.com",     "India's leading e-commerce platform"),
    ("Microsoft India",       "MSFT", "https://www.microsoft.com/en-in", "Cloud, AI & enterprise software"),
    ("Amazon India",          "AMZN", "https://www.amazon.in",        "E-commerce & AWS cloud services"),
    ("Infosys",               "Infy", "https://www.infosys.com",      "IT services & consulting"),
]
client_objs = {}
for name, short, url, desc in clients_data:
    c = Client(name=name, short_name=short, website_url=url, description=desc, last_updated_by=kam.name)
    db.add(c); db.flush()
    client_objs[short] = c
db.commit()
print(f"✓ {len(clients_data)} clients created")

# ── Helpers ────────────────────────────────────────────────────────────────────

def dt(year, month, day, hour=9, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)

def after(base, **kw):
    return base + timedelta(**kw)

def make_candidate(job, name, mobile, email, city, skills, exp_range,
                   sourced_by, assigned_to=None, sourced_at=None):
    c = Candidate(
        job_id=job.id, full_name=name, mobile=mobile, email=email,
        city=city, skills=skills, exp_range=exp_range,
        sourced_by_id=sourced_by.id,
        assigned_to_id=assigned_to.id if assigned_to else None,
        status=CandidateStatus.sourced,
        sourced_at=sourced_at, updated_at=sourced_at,
    )
    db.add(c); db.flush(); return c

def add_call(candidate, caller, call_at, outcome="5_10min", notes="Candidate is interested and matches JD"):
    log = CallLog(candidate_id=candidate.id, caller_id=caller.id,
                  call_date=call_at, outcome=outcome, notes=notes, created_at=call_at)
    db.add(log); db.flush()
    candidate.status = CandidateStatus.call_in_progress
    return log

def add_assessment(candidate, caller, assessed_at, comm=4.0, tech=4.0, soft=3.8,
                   total_exp=4.0, rel_exp=3.0, curr_ctc=10.0, exp_ctc=14.0,
                   notice=4, notes="Strong profile, good comm skills",
                   pass_val="Yes"):
    score = round((tech + soft) / 2, 2)
    auto_rec = "Strong Submit" if score >= 4.0 else ("Consider" if score >= 3.25 else "Hold")
    a = Assessment(
        candidate_id=candidate.id, caller_id=caller.id,
        total_exp=total_exp, relevant_exp=rel_exp,
        current_ctc=curr_ctc, expected_ctc=exp_ctc,
        hike_pct=round((exp_ctc - curr_ctc) / curr_ctc * 100, 1),
        notice_period_weeks=notice,
        comm_score=comm, role_art_score=tech, resume_skill_score=tech,
        tech_qa_score=tech, paraphrase_score=soft, confidence_score=soft,
        self_art_score=soft,
        overall_score=score, tech_score=tech, soft_skill_score=soft,
        auto_recommendation=auto_rec,
        pass_to_validation=pass_val,
        caller_notes=notes,
        created_at=assessed_at, updated_at=assessed_at,
    )
    db.add(a); db.flush()
    candidate.status = CandidateStatus.ready_for_validation
    return a

def add_mail(candidate, sent_by, sent_at, ack=True, dl_ver=True):
    m = ConsultantMail(
        candidate_id=candidate.id, sent_by_id=sent_by.id,
        sent_at=sent_at,
        acknowledgement_received=ack,
        acknowledgement_at=after(sent_at, hours=5) if ack else None,
        dl_verified=dl_ver,
        dl_verified_at=after(sent_at, hours=9) if dl_ver else None,
    )
    db.add(m); db.flush(); return m

def add_validation(candidate, validator, val_at, status="validated",
                   comments="Profile reviewed and cleared for submission"):
    v = Validation(
        candidate_id=candidate.id, delivery_lead_id=validator.id,
        status=status, comments=comments,
        created_at=val_at, updated_at=val_at,
    )
    db.add(v); db.flush()
    status_map = {
        "validated":    CandidateStatus.validated,
        "needs_review": CandidateStatus.needs_rework,
        "on_hold":      CandidateStatus.on_hold,
        "rejected":     CandidateStatus.rejected,
    }
    candidate.status = status_map.get(status, CandidateStatus.validated)
    if status == "rejected":
        candidate.rejected_by = f"Delivery Lead: {validator.name}"
        candidate.rejection_reason = comments
    return v

def add_submission(candidate, job, submitted_by, sub_at, stage):
    s = Submission(
        candidate_id=candidate.id, job_id=job.id,
        delivery_lead_id=submitted_by.id,
        submitted_at=sub_at, current_stage=stage,
    )
    db.add(s); db.flush()
    candidate.status = CandidateStatus.submitted_to_client
    add_timeline(s, stage, sub_at, submitted_by)
    return s

def add_timeline(sub, stage, at, by=None):
    labels = {
        "submitted": "Submitted to Client",
        "ta_review": "TA Screening", "ta_rejected": "TA Rejected",
        "hm_review": "HM Screening", "hm_rejected": "HM Rejected",
        "shortlisted": "Shortlisted",
        "l1_scheduled": "L1 Scheduled", "l1_feedback_pending": "L1 Feedback Pending",
        "l1_cleared": "L1 Cleared", "l1_rejected": "L1 Rejected",
        "l2_scheduled": "L2 Scheduled", "l2_feedback_pending": "L2 Feedback Pending",
        "l2_cleared": "L2 Cleared", "l2_rejected": "L2 Rejected",
        "final_scheduled": "Final Round Scheduled", "final_cleared": "Final Cleared",
        "offer_rolled_out": "Offer Rolled Out", "offer_accepted": "Offer Accepted",
        "joined": "Joined",
    }
    t = SubmissionTimeline(
        submission_id=sub.id, stage=stage,
        stage_label=labels.get(stage, stage),
        updated_by_id=by.id if by else None,
        created_at=at,
    )
    db.add(t); db.flush()

def progress_submission(sub, candidate, stages_with_times):
    """Advance submission through multiple stages."""
    for stage, at, by_user in stages_with_times:
        sub.current_stage = stage
        sub.updated_at = at
        if stage in ("offer_rolled_out", "offer_accepted", "joined"):
            candidate.status = CandidateStatus.joined if stage == "joined" else CandidateStatus.offer_rolled_out
        elif stage in ("ta_rejected", "hm_rejected", "l1_rejected", "l2_rejected", "final_rejected"):
            candidate.status = CandidateStatus.submitted_to_client
        else:
            candidate.status = CandidateStatus.interview_stage
        add_timeline(sub, stage, at, by_user)
    db.flush()

def reject_by_kam(candidate, reason):
    candidate.status = CandidateStatus.rejected
    candidate.rejected_by = f"KAM: {kam.name}"
    candidate.rejection_reason = reason

# ── 4. Jobs ───────────────────────────────────────────────────────────────────
print("Creating jobs and candidates…")

J = {}  # job dict

# ── JOB 1: Data Engineer @ GEHC ───────────────────────────────────────────────
j = Job(
    client_name="GE Healthcare (GEHC)", role_title="Data Engineer",
    skill_stack="Python, Apache Spark, SQL, Databricks, AWS",
    work_mode=WorkMode.hybrid_2, headcount=3, location="Bangalore",
    jd_summary="Build and maintain scalable data pipelines for clinical analytics.",
    min_experience=3, max_experience=7, salary_range="18-28 LPA",
    status=JobStatus.open,
    created_by_id=kam.id, delivery_lead_id=dl.id,
    account_manager_id=bh1.id,
    sourcer_ids=json.dumps([gagana.id]),
    caller_ids=json.dumps([prathik.id]),
    assigned_sourcer_id=gagana.id, assigned_caller_id=prathik.id,
    deadline=dt(2026, 5, 30),
    created_at=dt(2026, 3, 15, 9), updated_at=dt(2026, 3, 15, 13),
)
db.add(j); db.flush(); J[1] = j

# Candidate 1 — JOINED (full pipeline)
base = dt(2026, 3, 17, 10)
c1 = make_candidate(j, "Arjun Mehta", "9844100001", "arjun.mehta@gmail.com",
                    "Bangalore", "Python, Spark, SQL, AWS", "4-6 yrs", gagana, prathik, base)
add_call(c1, prathik, after(base, hours=7))
add_assessment(c1, prathik, after(base, hours=11), comm=4.5, tech=4.5, soft=4.2,
               total_exp=5, rel_exp=4, curr_ctc=14, exp_ctc=20, notice=4,
               notes="Excellent Spark expertise, good problem solving, ready to join in 4 weeks")
add_mail(c1, gagana, after(base, days=2, hours=3))
add_validation(c1, dl, after(base, days=3))
s1 = add_submission(c1, j, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s1, c1, [
    ("ta_review",    after(base, days=5),  kam),
    ("shortlisted",  after(base, days=7),  kam),
    ("l1_scheduled", after(base, days=9),  kam),
    ("l1_cleared",   after(base, days=12), kam),
    ("l2_scheduled", after(base, days=14), kam),
    ("l2_cleared",   after(base, days=17), kam),
    ("final_scheduled", after(base, days=19), kam),
    ("final_cleared",   after(base, days=22), kam),
    ("offer_rolled_out", after(base, days=24), kam),
    ("offer_accepted",   after(base, days=26), kam),
    ("joined",           after(base, days=35), kam),
])
c1.status = CandidateStatus.joined

# Candidate 2 — OFFER ROLLED OUT
base = dt(2026, 3, 19, 9)
c2 = make_candidate(j, "Kavitha Nair", "9844100002", "kavitha.nair@gmail.com",
                    "Chennai", "Python, Databricks, Spark, PySpark", "5-8 yrs", gagana, prathik, base)
add_call(c2, prathik, after(base, hours=6))
add_assessment(c2, prathik, after(base, hours=10), comm=4.2, tech=4.3, soft=4.0,
               total_exp=6, rel_exp=5, curr_ctc=18, exp_ctc=26, notice=6,
               notes="Strong profile, 6 yrs experience with Databricks, notice period negotiable")
add_mail(c2, gagana, after(base, days=2, hours=4))
add_validation(c2, dl, after(base, days=3, hours=2))
s2 = add_submission(c2, j, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s2, c2, [
    ("ta_review",        after(base, days=5),  kam),
    ("shortlisted",      after(base, days=7),  kam),
    ("l1_scheduled",     after(base, days=9),  kam),
    ("l1_cleared",       after(base, days=12), kam),
    ("l2_scheduled",     after(base, days=14), kam),
    ("l2_cleared",       after(base, days=16), kam),
    ("offer_rolled_out", after(base, days=20), kam),
])
c2.status = CandidateStatus.offer_rolled_out

# Candidate 3 — L1 SCHEDULED
base = dt(2026, 3, 21, 11)
c3 = make_candidate(j, "Srinivas Rao", "9844100003", "srinivas.rao@gmail.com",
                    "Hyderabad", "Python, SQL, Airflow, GCP", "3-5 yrs", gagana, prathik, base)
add_call(c3, prathik, after(base, hours=5))
add_assessment(c3, prathik, after(base, hours=9), comm=4.0, tech=4.1, soft=3.9,
               total_exp=4, rel_exp=3, curr_ctc=10, exp_ctc=16, notice=4)
add_mail(c3, gagana, after(base, days=2))
add_validation(c3, dl, after(base, days=3))
s3 = add_submission(c3, j, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s3, c3, [
    ("ta_review",    after(base, days=5), kam),
    ("shortlisted",  after(base, days=6), kam),
    ("l1_scheduled", after(base, days=8), kam),
])
c3.status = CandidateStatus.interview_stage

# Candidate 4 — NEEDS REWORK
base = dt(2026, 3, 23, 10)
c4 = make_candidate(j, "Pooja Sharma", "9844100004", "pooja.sharma@gmail.com",
                    "Pune", "Python, SQL, Tableau", "2-4 yrs", gagana, prathik, base)
add_call(c4, prathik, after(base, hours=5))
add_assessment(c4, prathik, after(base, hours=8), comm=3.5, tech=3.6, soft=3.4,
               total_exp=3, rel_exp=2, curr_ctc=8, exp_ctc=12, notice=2,
               pass_val="No", notes="Good candidate but needs to brush up on Spark internals")
add_validation(c4, dl, after(base, days=2),
               status="needs_review",
               comments="Assessment score borderline. Ask caller to clarify Spark streaming experience before approving.")

# Candidate 5 — REJECTED BY KAM
base = dt(2026, 3, 25, 9)
c5 = make_candidate(j, "Deepak Kumar", "9844100005", "deepak.kumar@gmail.com",
                    "Bangalore", "Python, Spark, Azure", "6-9 yrs", gagana, prathik, base)
add_call(c5, prathik, after(base, hours=4))
add_assessment(c5, prathik, after(base, hours=7), comm=4.3, tech=4.4, soft=4.1,
               total_exp=8, rel_exp=6, curr_ctc=22, exp_ctc=35, notice=8)
add_mail(c5, gagana, after(base, days=2))
add_validation(c5, dl, after(base, days=3))
sub5 = add_submission(c5, j, kam, after(base, days=4), InterviewStage.submitted)
reject_by_kam(c5, "CTC expectation ₹35L is 25% above client budget cap of ₹28L. Not viable.")
db.flush()

# ── JOB 2: Full Stack Developer @ JLL ────────────────────────────────────────
j2 = Job(
    client_name="JLL India", role_title="Full Stack Developer",
    skill_stack="React, Node.js, TypeScript, PostgreSQL, Docker",
    work_mode=WorkMode.hybrid_3, headcount=2, location="Mumbai",
    jd_summary="Build and maintain commercial real estate platforms.",
    min_experience=3, max_experience=6, salary_range="15-22 LPA",
    status=JobStatus.open,
    created_by_id=kam.id, delivery_lead_id=dl.id,
    account_manager_id=bh2.id,
    sourcer_ids=json.dumps([nithish.id]),
    caller_ids=json.dumps([ravi.id]),
    assigned_sourcer_id=nithish.id, assigned_caller_id=ravi.id,
    deadline=dt(2026, 4, 20),   # OVERDUE
    created_at=dt(2026, 3, 18, 9), updated_at=dt(2026, 3, 18, 13),
)
db.add(j2); db.flush(); J[2] = j2

# Candidate 1 — L2 CLEARED
base = dt(2026, 3, 20, 10)
c = make_candidate(j2, "Lakshmi Priya V", "9844200001", "lakshmi.priya@gmail.com",
                   "Mumbai", "React, Node.js, TypeScript, MongoDB", "4-6 yrs", nithish, ravi, base)
add_call(c, ravi, after(base, hours=6))
add_assessment(c, ravi, after(base, hours=10), comm=4.5, tech=4.3, soft=4.2,
               total_exp=5, rel_exp=4, curr_ctc=13, exp_ctc=20, notice=4)
add_mail(c, nithish, after(base, days=2, hours=3))
add_validation(c, dl, after(base, days=3))
s = add_submission(c, j2, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s, c, [
    ("ta_review",    after(base, days=5), kam),
    ("shortlisted",  after(base, days=7), kam),
    ("l1_scheduled", after(base, days=9), kam),
    ("l1_cleared",   after(base, days=11), kam),
    ("l2_scheduled", after(base, days=13), kam),
    ("l2_cleared",   after(base, days=15), kam),
])
c.status = CandidateStatus.interview_stage

# Candidate 2 — L1 FEEDBACK PENDING
base = dt(2026, 3, 22, 11)
c = make_candidate(j2, "Mohammed Faiz", "9844200002", "mohammed.faiz@gmail.com",
                   "Pune", "React, JavaScript, GraphQL, AWS", "3-5 yrs", nithish, ravi, base)
add_call(c, ravi, after(base, hours=5))
add_assessment(c, ravi, after(base, hours=9), comm=4.0, tech=4.1, soft=3.8,
               total_exp=4, rel_exp=3, curr_ctc=11, exp_ctc=17, notice=6)
add_mail(c, nithish, after(base, days=2))
add_validation(c, dl, after(base, days=3))
s = add_submission(c, j2, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s, c, [
    ("ta_review",           after(base, days=5),  kam),
    ("shortlisted",         after(base, days=7),  kam),
    ("l1_scheduled",        after(base, days=9),  kam),
    ("l1_feedback_pending", after(base, days=11), kam),
])
c.status = CandidateStatus.interview_stage

# Candidate 3 — SUBMITTED, TA REVIEW
base = dt(2026, 3, 24, 9)
c = make_candidate(j2, "Ankit Gupta", "9844200003", "ankit.gupta@gmail.com",
                   "Bangalore", "React, Vue.js, Node.js, MySQL", "2-4 yrs", nithish, ravi, base)
add_call(c, ravi, after(base, hours=4))
add_assessment(c, ravi, after(base, hours=8), comm=3.8, tech=4.0, soft=3.7,
               total_exp=3, rel_exp=2, curr_ctc=9, exp_ctc=14, notice=4)
add_mail(c, nithish, after(base, days=2))
add_validation(c, dl, after(base, days=3))
s = add_submission(c, j2, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s, c, [("ta_review", after(base, days=5), kam)])
c.status = CandidateStatus.submitted_to_client

# Candidate 4 — READY FOR VALIDATION
base = dt(2026, 3, 26, 10)
c = make_candidate(j2, "Preethi Kumar", "9844200004", "preethi.kumar@gmail.com",
                   "Chennai", "Angular, Node.js, PostgreSQL", "3-5 yrs", nithish, ravi, base)
add_call(c, ravi, after(base, hours=5))
add_assessment(c, ravi, after(base, hours=9), comm=4.1, tech=3.9, soft=3.8,
               total_exp=4, rel_exp=3, curr_ctc=10, exp_ctc=16, notice=4)
add_mail(c, nithish, after(base, days=2), ack=False, dl_ver=False)

# Candidate 5 — CALL IN PROGRESS
base = dt(2026, 3, 28, 11)
c = make_candidate(j2, "Rahul Singh", "9844200005", "rahul.singh@gmail.com",
                   "Noida", "React, Redux, Node.js", "2-4 yrs", nithish, ravi, base)
add_call(c, ravi, after(base, hours=6))

# ── JOB 3: Embedded Systems @ Analog Devices ─────────────────────────────────
j3 = Job(
    client_name="Analog Devices India", role_title="Embedded Systems Engineer",
    skill_stack="C, C++, RTOS, ARM Cortex, CAN Bus, AUTOSAR",
    work_mode=WorkMode.onsite, headcount=2, location="Bangalore",
    jd_summary="Develop firmware for industrial IoT sensors and motor control.",
    min_experience=3, max_experience=8, salary_range="16-26 LPA",
    status=JobStatus.open,
    created_by_id=kam.id, delivery_lead_id=dl.id,
    account_manager_id=bh3.id,
    sourcer_ids=json.dumps([shwetha.id]),
    caller_ids=json.dumps([shwetha.id]),
    assigned_sourcer_id=shwetha.id, assigned_caller_id=shwetha.id,
    deadline=dt(2026, 6, 1),
    created_at=dt(2026, 3, 20, 10), updated_at=dt(2026, 3, 20, 15),
)
db.add(j3); db.flush(); J[3] = j3

# C1 — FINAL CLEARED
base = dt(2026, 3, 22, 9)
c = make_candidate(j3, "Suresh Kumar M", "9844300001", "suresh.kumar@gmail.com",
                   "Bangalore", "C, RTOS (FreeRTOS), ARM Cortex-M, CAN, I2C", "5-7 yrs", shwetha, shwetha, base)
add_call(c, shwetha, after(base, hours=5))
add_assessment(c, shwetha, after(base, hours=9), comm=4.2, tech=4.5, soft=4.0,
               total_exp=6, rel_exp=5, curr_ctc=16, exp_ctc=24, notice=4)
add_mail(c, shwetha, after(base, days=2, hours=3))
add_validation(c, dl, after(base, days=3))
s = add_submission(c, j3, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s, c, [
    ("ta_review",       after(base, days=5),  kam),
    ("shortlisted",     after(base, days=7),  kam),
    ("l1_scheduled",    after(base, days=9),  kam),
    ("l1_cleared",      after(base, days=12), kam),
    ("final_scheduled", after(base, days=15), kam),
    ("final_cleared",   after(base, days=18), kam),
])
c.status = CandidateStatus.interview_stage

# C2 — VALIDATED (ready for submission)
base = dt(2026, 3, 24, 10)
c = make_candidate(j3, "Meenakshi Sundaram", "9844300002", "meenakshi.s@gmail.com",
                   "Chennai", "C++, AUTOSAR, Embedded Linux, Yocto", "4-6 yrs", shwetha, shwetha, base)
add_call(c, shwetha, after(base, hours=6))
add_assessment(c, shwetha, after(base, hours=10), comm=4.0, tech=4.2, soft=3.9,
               total_exp=5, rel_exp=4, curr_ctc=14, exp_ctc=21, notice=8)
add_mail(c, shwetha, after(base, days=2, hours=4))
add_validation(c, dl, after(base, days=3, hours=2))

# C3 — MAIL SENT, PENDING ACK
base = dt(2026, 3, 26, 11)
c = make_candidate(j3, "Rohan Bhat", "9844300003", "rohan.bhat@gmail.com",
                   "Bangalore", "C, FreeRTOS, STM32, I2C, SPI", "3-5 yrs", shwetha, shwetha, base)
add_call(c, shwetha, after(base, hours=5))
add_assessment(c, shwetha, after(base, hours=8), comm=3.9, tech=4.0, soft=3.7,
               total_exp=4, rel_exp=3, curr_ctc=11, exp_ctc=16, notice=4)
add_mail(c, shwetha, after(base, days=2), ack=False, dl_ver=False)
c.status = CandidateStatus.ready_for_validation

# C4 — JUST SOURCED
base = dt(2026, 3, 30, 14)
c = make_candidate(j3, "Divya Menon", "9844300004", "divya.menon@gmail.com",
                   "Kochi", "C, ARM, RTOS", "2-4 yrs", shwetha, None, base)

# ── JOB 4: ML Engineer @ Sony ────────────────────────────────────────────────
j4 = Job(
    client_name="Sony India", role_title="ML Engineer",
    skill_stack="Python, TensorFlow, PyTorch, MLflow, Kubeflow",
    work_mode=WorkMode.hybrid_2, headcount=2, location="Bangalore",
    jd_summary="Build recommendation systems and computer vision pipelines.",
    min_experience=3, max_experience=7, salary_range="20-32 LPA",
    status=JobStatus.open,
    created_by_id=kam.id, delivery_lead_id=dl.id,
    account_manager_id=bh1.id,
    sourcer_ids=json.dumps([gagana.id, nithish.id]),
    caller_ids=json.dumps([prathik.id]),
    assigned_sourcer_id=gagana.id, assigned_caller_id=prathik.id,
    deadline=dt(2026, 5, 25),
    created_at=dt(2026, 3, 22, 9), updated_at=dt(2026, 3, 22, 11),
)
db.add(j4); db.flush(); J[4] = j4

# C1 — HM SHORTLISTED
base = dt(2026, 3, 24, 10)
c = make_candidate(j4, "Aditya Sharma", "9844400001", "aditya.sharma@gmail.com",
                   "Bangalore", "Python, TensorFlow, Keras, MLflow, Docker", "4-6 yrs", gagana, prathik, base)
add_call(c, prathik, after(base, hours=6))
add_assessment(c, prathik, after(base, hours=10), comm=4.3, tech=4.4, soft=4.1,
               total_exp=5, rel_exp=4, curr_ctc=15, exp_ctc=24, notice=6)
add_mail(c, gagana, after(base, days=2, hours=3))
add_validation(c, dl, after(base, days=3))
s = add_submission(c, j4, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s, c, [
    ("ta_review",  after(base, days=5), kam),
    ("hm_review",  after(base, days=7), kam),
    ("shortlisted", after(base, days=9), kam),
])
c.status = CandidateStatus.interview_stage

# C2 — SUBMITTED, TA REVIEW
base = dt(2026, 3, 26, 9)
c = make_candidate(j4, "Sunita Reddy", "9844400002", "sunita.reddy@gmail.com",
                   "Hyderabad", "Python, PyTorch, Kubeflow, AWS SageMaker", "5-7 yrs", nithish, prathik, base)
add_call(c, prathik, after(base, hours=5))
add_assessment(c, prathik, after(base, hours=9), comm=4.1, tech=4.2, soft=4.0,
               total_exp=6, rel_exp=5, curr_ctc=19, exp_ctc=28, notice=4)
add_mail(c, nithish, after(base, days=2))
add_validation(c, dl, after(base, days=3))
s = add_submission(c, j4, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s, c, [("ta_review", after(base, days=5), kam)])
c.status = CandidateStatus.submitted_to_client

# C3 — VALIDATED
base = dt(2026, 3, 28, 11)
c = make_candidate(j4, "Karthik Raja", "9844400003", "karthik.raja@gmail.com",
                   "Chennai", "Python, TensorFlow, NLP, Transformers", "3-5 yrs", gagana, prathik, base)
add_call(c, prathik, after(base, hours=6))
add_assessment(c, prathik, after(base, hours=10), comm=4.0, tech=4.2, soft=3.9,
               total_exp=4, rel_exp=3, curr_ctc=12, exp_ctc=19, notice=4)
add_mail(c, gagana, after(base, days=2), ack=True, dl_ver=False)
add_validation(c, dl, after(base, days=4))

# C4 — REJECTED BY DL (low score)
base = dt(2026, 3, 30, 10)
c = make_candidate(j4, "Bhavana Singh", "9844400004", "bhavana.singh@gmail.com",
                   "Bangalore", "Python, Scikit-learn, Pandas", "2-3 yrs", gagana, prathik, base)
add_call(c, prathik, after(base, hours=5))
add_assessment(c, prathik, after(base, hours=8), comm=3.2, tech=3.0, soft=3.1,
               total_exp=2, rel_exp=1.5, curr_ctc=7, exp_ctc=11, notice=2,
               pass_val="No", notes="Profile is junior, limited hands-on ML production experience")
add_validation(c, dl, after(base, days=2),
               status="rejected",
               comments="Score 3.05 is below threshold. Profile not suitable for senior ML role.")

# ── JOB 5: Backend Engineer @ Flipkart ───────────────────────────────────────
j5 = Job(
    client_name="Flipkart", role_title="Backend Engineer",
    skill_stack="Java, Spring Boot, Kafka, Microservices, Redis, MySQL",
    work_mode=WorkMode.hybrid_2, headcount=3, location="Bangalore",
    jd_summary="Build high-throughput microservices for Flipkart's supply chain.",
    min_experience=4, max_experience=8, salary_range="22-35 LPA",
    status=JobStatus.open,
    created_by_id=kam.id, delivery_lead_id=dl.id,
    account_manager_id=bh2.id,
    sourcer_ids=json.dumps([subhashree.id]),
    caller_ids=json.dumps([ravi.id]),
    assigned_sourcer_id=subhashree.id, assigned_caller_id=ravi.id,
    deadline=dt(2026, 6, 10),
    created_at=dt(2026, 3, 25, 9), updated_at=dt(2026, 3, 25, 12),
)
db.add(j5); db.flush(); J[5] = j5

# C1 — L1 CLEARED
base = dt(2026, 3, 27, 9)
c = make_candidate(j5, "Priya Sundaram", "9844500001", "priya.sundaram@gmail.com",
                   "Bangalore", "Java, Spring Boot, Kafka, Docker, Kubernetes", "5-7 yrs", subhashree, ravi, base)
add_call(c, ravi, after(base, hours=5))
add_assessment(c, ravi, after(base, hours=9), comm=4.4, tech=4.5, soft=4.2,
               total_exp=6, rel_exp=5, curr_ctc=21, exp_ctc=32, notice=4)
add_mail(c, subhashree, after(base, days=2, hours=3))
add_validation(c, dl, after(base, days=3))
s = add_submission(c, j5, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s, c, [
    ("ta_review",    after(base, days=5),  kam),
    ("shortlisted",  after(base, days=7),  kam),
    ("l1_scheduled", after(base, days=9),  kam),
    ("l1_cleared",   after(base, days=12), kam),
])
c.status = CandidateStatus.interview_stage

# C2 — SUBMITTED
base = dt(2026, 3, 29, 10)
c = make_candidate(j5, "Nikhil Sharma", "9844500002", "nikhil.sharma@gmail.com",
                   "Noida", "Java, Kafka, Redis, Microservices, AWS", "4-6 yrs", subhashree, ravi, base)
add_call(c, ravi, after(base, hours=4))
add_assessment(c, ravi, after(base, hours=8), comm=4.0, tech=4.1, soft=3.9,
               total_exp=5, rel_exp=4, curr_ctc=18, exp_ctc=28, notice=6)
add_mail(c, subhashree, after(base, days=2))
add_validation(c, dl, after(base, days=3))
s = add_submission(c, j5, kam, after(base, days=4), InterviewStage.submitted)
c.status = CandidateStatus.submitted_to_client

# C3 — CALL IN PROGRESS
base = dt(2026, 4, 2, 11)
c = make_candidate(j5, "Swetha Gowda", "9844500003", "swetha.gowda@gmail.com",
                   "Mysore", "Java, Spring, Hibernate, MySQL", "3-5 yrs", subhashree, ravi, base)
add_call(c, ravi, after(base, hours=6))

# C4 — JUST SOURCED
base = dt(2026, 4, 5, 14)
c = make_candidate(j5, "Rajesh Patel", "9844500004", "rajesh.patel@gmail.com",
                   "Ahmedabad", "Java, Kafka, Spring Boot", "4-6 yrs", subhashree, None, base)

# ── JOB 6: Cloud Architect @ Microsoft ───────────────────────────────────────
j6 = Job(
    client_name="Microsoft India", role_title="Cloud Architect",
    skill_stack="Azure, Terraform, Kubernetes, Python, ARM Templates",
    work_mode=WorkMode.hybrid_2, headcount=2, location="Hyderabad",
    jd_summary="Design and implement cloud-native architectures on Azure.",
    min_experience=7, max_experience=12, salary_range="35-55 LPA",
    status=JobStatus.open,
    created_by_id=kam.id, delivery_lead_id=dl.id,
    account_manager_id=bh3.id,
    sourcer_ids=json.dumps([nithish.id]),
    caller_ids=json.dumps([ravi.id]),
    assigned_sourcer_id=nithish.id, assigned_caller_id=ravi.id,
    deadline=dt(2026, 6, 20),
    created_at=dt(2026, 4, 1, 10), updated_at=dt(2026, 4, 1, 16),
)
db.add(j6); db.flush(); J[6] = j6

# C1 — OFFER ACCEPTED
base = dt(2026, 4, 3, 10)
c = make_candidate(j6, "Sanjay Menon", "9844600001", "sanjay.menon@gmail.com",
                   "Hyderabad", "Azure, Terraform, AKS, DevOps, Python", "9-12 yrs", nithish, ravi, base)
add_call(c, ravi, after(base, hours=4))
add_assessment(c, ravi, after(base, hours=8), comm=4.5, tech=4.8, soft=4.4,
               total_exp=10, rel_exp=8, curr_ctc=38, exp_ctc=52, notice=6)
add_mail(c, nithish, after(base, days=2, hours=3))
add_validation(c, dl, after(base, days=3))
s = add_submission(c, j6, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s, c, [
    ("ta_review",    after(base, days=5),  kam),
    ("shortlisted",  after(base, days=6),  kam),
    ("l1_scheduled", after(base, days=8),  kam),
    ("l1_cleared",   after(base, days=10), kam),
    ("final_scheduled", after(base, days=12), kam),
    ("final_cleared",   after(base, days=15), kam),
    ("offer_rolled_out", after(base, days=17), kam),
    ("offer_accepted",   after(base, days=19), kam),
])
c.status = CandidateStatus.offer_rolled_out

# C2 — FINAL SCHEDULED
base = dt(2026, 4, 5, 9)
c = make_candidate(j6, "Rekha Kumar", "9844600002", "rekha.kumar@gmail.com",
                   "Bangalore", "Azure, GCP, Terraform, Python, Ansible", "8-10 yrs", nithish, ravi, base)
add_call(c, ravi, after(base, hours=5))
add_assessment(c, ravi, after(base, hours=9), comm=4.2, tech=4.6, soft=4.1,
               total_exp=9, rel_exp=7, curr_ctc=35, exp_ctc=50, notice=4)
add_mail(c, nithish, after(base, days=2))
add_validation(c, dl, after(base, days=3))
s = add_submission(c, j6, kam, after(base, days=4), InterviewStage.submitted)
progress_submission(s, c, [
    ("ta_review",       after(base, days=5),  kam),
    ("shortlisted",     after(base, days=7),  kam),
    ("l1_scheduled",    after(base, days=9),  kam),
    ("l1_cleared",      after(base, days=11), kam),
    ("final_scheduled", after(base, days=14), kam),
])
c.status = CandidateStatus.interview_stage

# ── JOB 7: Senior SDE @ Amazon (ON_HOLD) ─────────────────────────────────────
j7 = Job(
    client_name="Amazon India", role_title="Senior SDE",
    skill_stack="Java, Distributed Systems, Kafka, DynamoDB, AWS",
    work_mode=WorkMode.hybrid_2, headcount=2, location="Bangalore",
    jd_summary="Senior SDE for Alexa AI team. Role on hold pending headcount approval.",
    min_experience=6, max_experience=10, salary_range="40-60 LPA",
    status=JobStatus.on_hold,
    created_by_id=kam.id, delivery_lead_id=dl.id,
    account_manager_id=bh1.id,
    sourcer_ids=json.dumps([gagana.id]),
    caller_ids=json.dumps([prathik.id]),
    assigned_sourcer_id=gagana.id, assigned_caller_id=prathik.id,
    deadline=dt(2026, 7, 1),
    created_at=dt(2026, 4, 5, 10), updated_at=dt(2026, 4, 5, 14),
)
db.add(j7); db.flush(); J[7] = j7

base = dt(2026, 4, 7, 10)
c = make_candidate(j7, "Aruna Krishnan", "9844700001", "aruna.krishnan@gmail.com",
                   "Bangalore", "Java, AWS, DynamoDB, Kafka, Spring", "7-9 yrs", gagana, prathik, base)
add_call(c, prathik, after(base, hours=5))
add_assessment(c, prathik, after(base, hours=9), comm=4.3, tech=4.6, soft=4.2,
               total_exp=8, rel_exp=7, curr_ctc=34, exp_ctc=48, notice=6)
c.status = CandidateStatus.on_hold

# ── JOB 8: DevOps @ Infosys ──────────────────────────────────────────────────
j8 = Job(
    client_name="Infosys", role_title="DevOps Engineer",
    skill_stack="Kubernetes, Docker, Jenkins, Terraform, AWS, Python",
    work_mode=WorkMode.hybrid_3, headcount=4, location="Bangalore",
    jd_summary="Manage CI/CD pipelines and Kubernetes infra for enterprise clients.",
    min_experience=3, max_experience=7, salary_range="12-20 LPA",
    status=JobStatus.open,
    created_by_id=kam.id, delivery_lead_id=dl.id,
    account_manager_id=bh2.id,
    sourcer_ids=json.dumps([subhashree.id]),
    caller_ids=json.dumps([shwetha.id]),
    assigned_sourcer_id=subhashree.id, assigned_caller_id=shwetha.id,
    deadline=dt(2026, 6, 30),
    created_at=dt(2026, 4, 10, 9), updated_at=dt(2026, 4, 10, 12),
)
db.add(j8); db.flush(); J[8] = j8

# C1 — NEEDS REWORK
base = dt(2026, 4, 12, 10)
c = make_candidate(j8, "Kiran Bhat", "9844800001", "kiran.bhat@gmail.com",
                   "Mangalore", "Docker, Kubernetes, Jenkins, Linux", "3-5 yrs", subhashree, shwetha, base)
add_call(c, shwetha, after(base, hours=5))
add_assessment(c, shwetha, after(base, hours=8), comm=3.6, tech=3.8, soft=3.5,
               total_exp=4, rel_exp=3, curr_ctc=10, exp_ctc=15, notice=4,
               pass_val="No", notes="Gaps in Terraform knowledge. Needs to revisit IaC concepts.")
add_validation(c, dl, after(base, days=2),
               status="needs_review",
               comments="Ask recruiter to clarify IaC hands-on experience before proceeding.")

# C2 — HANDED TO RECRUITER
base = dt(2026, 4, 14, 9)
c = make_candidate(j8, "Deepa Raj", "9844800002", "deepa.raj@gmail.com",
                   "Bangalore", "Docker, AWS, Ansible, Python", "2-4 yrs", subhashree, shwetha, base)
c.status = CandidateStatus.handed_to_recruiter

# C3 — POOL VERIFIED
base = dt(2026, 4, 16, 11)
c = make_candidate(j8, "Prashanth K", "9844800003", "prashanth.k@gmail.com",
                   "Mysore", "Kubernetes, CI/CD, Git, Linux", "3-5 yrs", subhashree, None, base)
c.status = CandidateStatus.pool_verified

# C4 — SOURCED
base = dt(2026, 4, 18, 14)
c = make_candidate(j8, "Amritha Nair", "9844800004", "amritha.nair@gmail.com",
                   "Kochi", "Docker, Jenkins, Python, Shell", "2-4 yrs", subhashree, None, base)

db.commit()
print("✓ All jobs and candidates created with full pipeline data")

# ── Summary ────────────────────────────────────────────────────────────────────
jobs_count = db.execute(text("SELECT COUNT(*) FROM jobs")).scalar()
cands_count = db.execute(text("SELECT COUNT(*) FROM candidates")).scalar()
mails_count = db.execute(text("SELECT COUNT(*) FROM consultant_mails")).scalar()
val_count   = db.execute(text("SELECT COUNT(*) FROM validations")).scalar()
sub_count   = db.execute(text("SELECT COUNT(*) FROM submissions")).scalar()
tl_count    = db.execute(text("SELECT COUNT(*) FROM submission_timeline")).scalar()

print(f"""
╔══════════════════════════════════════════════╗
  Seed complete!
  Jobs:               {jobs_count}
  Candidates:         {cands_count}
  Consultant Mails:   {mails_count}
  Validations:        {val_count}
  Submissions:        {sub_count}
  Timeline Entries:   {tl_count}
╚══════════════════════════════════════════════╝
Logins unchanged — admin/kam/dl/recruiter passwords same.
""")
db.close()
