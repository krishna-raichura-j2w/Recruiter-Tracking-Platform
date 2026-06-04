import enum
from datetime import datetime, timezone

from core.database import Base
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.orm import deferred, relationship


def now_utc():
    return datetime.now(timezone.utc)


def to_iso_utc(dt):
    """
    Serialize a datetime as an ISO 8601 string with explicit UTC offset.

    Why: model columns use `DateTime` (not `DateTime(timezone=True)`), so Postgres
    drops tzinfo on read and `.isoformat()` then emits a naive string that JS
    `new Date()` interprets as *local* time — shifting all timestamps by the
    viewer's UTC offset. Defaults are written as UTC, so treat naives as UTC.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def isofy_datetimes(d: dict) -> dict:
    """In-place: convert every datetime value in `d` to a UTC-aware ISO string."""
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = to_iso_utc(v)
    return d


# ── Enums ──────────────────────────────────────────────────────────────────────


class UserRole(str, enum.Enum):
    admin = "admin"
    bh = "bh"
    kam = "kam"
    recruiter = "recruiter"
    delivery_lead = "delivery_lead"
    coo = "coo"
    hrbp = "hrbp"
    ops_head = "ops_head"


class RecruiterType(str, enum.Enum):
    sourcer = "sourcer"
    caller = "caller"
    both = "both"


class JobStatus(str, enum.Enum):
    pending_review = "pending_review"  # uploaded by pod_lead, awaiting DL review
    open = "open"
    on_hold = "on_hold"
    closed = "closed"


class WorkMode(str, enum.Enum):
    onsite = "Onsite"
    hybrid_2 = "Hybrid (2 days)"
    hybrid_3 = "Hybrid (3 days)"
    remote = "Remote"
    flexible = "Flexible"


class CandidateStatus(str, enum.Enum):
    sourced = "sourced"
    handed_to_recruiter = "handed_to_recruiter"
    call_in_progress = "call_in_progress"
    ready_for_validation = "ready_for_validation"
    validated = "validated"
    needs_rework = "needs_rework"
    on_hold = "on_hold"
    rejected = "rejected"
    submitted_to_client = "submitted_to_client"
    interview_stage = "interview_stage"
    offer_rolled_out = "offer_rolled_out"
    joined = "joined"
    backed_out = "backed_out"


class CallOutcome(str, enum.Enum):
    lt_2min = "lt_2min"
    m_2_3 = "2_3min"
    m_3_5 = "3_5min"
    m_5_10 = "5_10min"
    gt_10min = "gt_10min"
    not_picking = "not_picking"
    high_notice = "high_notice"
    recently_joined = "recently_joined"
    not_relevant = "not_relevant"
    no_good_comm = "no_good_comm"
    call_back = "call_back"
    already_processed = "already_processed"
    not_looking = "not_looking"
    l1_other_client = "l1_other_client"


class AutoRecommendation(str, enum.Enum):
    strong_submit = "Strong Submit"
    consider = "Consider"
    hold = "Hold"


class ValidationStatus(str, enum.Enum):
    validated = "validated"
    needs_review = "needs_review"
    on_hold = "on_hold"
    rejected = "rejected"


class InterviewStage(str, enum.Enum):
    # Initial
    submitted = "submitted"
    # Client TA screening
    ta_review = "ta_review"
    ta_rejected = "ta_rejected"
    # Hiring Manager screening
    hm_review = "hm_review"
    hm_rejected = "hm_rejected"
    # Shortlisted for interview
    shortlisted = "shortlisted"
    # L1
    l1_scheduled = "l1_scheduled"
    l1_feedback_pending = "l1_feedback_pending"
    l1_cleared = "l1_cleared"
    l1_rejected = "l1_rejected"
    # L2
    l2_scheduled = "l2_scheduled"
    l2_feedback_pending = "l2_feedback_pending"
    l2_cleared = "l2_cleared"
    l2_rejected = "l2_rejected"
    # Final
    final_scheduled = "final_scheduled"
    final_feedback_pending = "final_feedback_pending"
    final_cleared = "final_cleared"
    final_rejected = "final_rejected"
    # Offer
    offer_rolled_out = "offer_rolled_out"
    offer_accepted = "offer_accepted"
    offer_declined = "offer_declined"
    # Closure
    joined = "joined"
    no_show = "no_show"


class NotifType(str, enum.Enum):
    callback_due = "callback_due"
    validation_done = "validation_done"
    ready_to_submit = "ready_to_submit"
    interview_scheduled = "interview_scheduled"
    feedback_overdue = "feedback_overdue"
    stale_candidate = "stale_candidate"
    general = "general"
    # New triggers
    jd_created = "jd_created"
    jd_assigned = "jd_assigned"
    candidate_sourced = "candidate_sourced"
    ready_for_validation = "ready_for_validation"
    candidate_validated = "candidate_validated"
    stage_updated = "stage_updated"


# ── Tables ─────────────────────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    role = Column(SAEnum(UserRole, native_enum=False), nullable=False)
    secondary_role = Column(
        String(30),
        nullable=True,
    )  # e.g. "delivery_lead" for a KAM who is also DL
    recruiter_type = Column(SAEnum(RecruiterType, native_enum=False), nullable=True)
    phone = Column(String(30), nullable=True)
    profile_url = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=False)
    pod_lead_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # New strict-tree pod membership (Pod → BH → KAM → DL → Recruiter).
    pod_id = Column(
        Integer,
        ForeignKey("pods.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    parent_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=now_utc)
    last_login_at = Column(DateTime, nullable=True)

    assigned_candidates = relationship(
        "Candidate",
        foreign_keys="Candidate.assigned_to_id",
        back_populates="assigned_to",
    )
    sourced_candidates = relationship(
        "Candidate",
        foreign_keys="Candidate.sourced_by_id",
        back_populates="sourced_by",
    )
    call_logs = relationship("CallLog", back_populates="caller")
    assessments = relationship("Assessment", back_populates="caller")
    validations = relationship("Validation", back_populates="delivery_lead")
    submissions = relationship("Submission", back_populates="delivery_lead")
    notifications = relationship("Notification", back_populates="user")
    pod_memberships = relationship(
        "PodMembership",
        foreign_keys="PodMembership.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    led_pod_memberships = relationship(
        "PodMembership",
        foreign_keys="PodMembership.pod_lead_id",
        back_populates="pod_lead",
    )
    pod = relationship("Pod", foreign_keys=[pod_id], back_populates="members")
    parent_user = relationship(
        "User",
        remote_side="User.id",
        foreign_keys=[parent_user_id],
    )


class PodMembership(Base):
    """Junction table: one user can belong to multiple DL teams."""

    __tablename__ = "pod_memberships"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    pod_lead_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=now_utc)

    __table_args__ = (
        UniqueConstraint("user_id", "pod_lead_id", name="uq_pod_membership"),
    )

    user = relationship(
        "User",
        foreign_keys=[user_id],
        back_populates="pod_memberships",
    )
    pod_lead = relationship(
        "User",
        foreign_keys=[pod_lead_id],
        back_populates="led_pod_memberships",
    )


class HourlyTarget(Base):
    """
    Per-user, per-hour submission target for a given day.

    Targets are set by admin/KAM (for DLs and recruiters) or KAM/DL (for
    recruiters). The leaderboard reads these to compute cumulative target so
    far based on the current time. `slot_index` references TIME_SLOTS in
    features/targets/routes.py (the canonical slot definitions).
    """

    __tablename__ = "hourly_targets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date = Column(Date, nullable=False, index=True)
    slot_index = Column(Integer, nullable=False)
    target_count = Column(Integer, nullable=False, default=0)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        UniqueConstraint("user_id", "date", "slot_index", name="uq_hourly_target"),
    )


class Pod(Base):
    """
    A pod is a team headed by one BH. Tree: BH → KAMs → DLs → Recruiters.

    Every member's `users.pod_id` points here; `users.parent_user_id` points to
    the level above in the same pod (BH has no parent inside the pod).
    """

    __tablename__ = "pods"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, unique=True)
    bh_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)

    bh = relationship("User", foreign_keys=[bh_user_id])
    members = relationship("User", foreign_keys="User.pod_id", back_populates="pod")


class BusinessHead(Base):
    __tablename__ = "account_managers"  # DB table kept for backward compat
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(200))
    phone = Column(String(30))
    created_at = Column(DateTime, default=now_utc)


class Client(Base):
    __tablename__ = "of_clients"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(
        Integer,
        unique=True,
        nullable=True,
    )  # external/business client identifier; FK target for jobs.client_id
    name = Column(String(120), unique=True, nullable=False)
    short_name = Column(String(80))
    website_url = Column(String(300))
    logo_data = Column(Text)  # base64 data URL
    description = Column(Text)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)
    last_updated_by = Column(String(120))  # name of user who last changed it


class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("of_clients.client_id"), nullable=True)
    client_name = Column(String(120), nullable=False)
    role_title = Column(String(200), nullable=False)
    job_id = Column(Integer, nullable=True)  # optional, UI-supplied numeric identifier
    probing_id = Column(Integer, ForeignKey("probing_data.id"), nullable=True)
    client_job_id = Column(String(100), nullable=True)
    demand_source = Column(String(80), nullable=True)  # Customer Tool / Other
    demand_type = Column(String(50), nullable=True)  # New / Backfill / Replacement
    demand_exclusivity = Column(String(50), nullable=True)  # Exclusive / Open
    skill_stack = Column(Text)
    work_mode = Column(SAEnum(WorkMode, native_enum=False))
    work_auth = Column(String(50))
    headcount = Column(Integer, default=1)
    status = Column(SAEnum(JobStatus, native_enum=False), default=JobStatus.open)
    location = Column(String(200))
    jd_summary = Column(Text)
    jd_parsed = Column(Text)  # full ParsedJD as JSON string
    jd_raw_text = Column(Text)  # original text/PDF-extracted content
    min_experience = Column(Integer)
    max_experience = Column(Integer)
    salary_range = Column(String(100))
    # ── OL-mapped fields ──────────────────────────────────────────────────────
    designation           = Column(String(200), nullable=True)
    walkin                = Column(Boolean, default=False)
    drive                 = Column(Boolean, default=False)
    start_time            = Column(String(20), nullable=True)   # walkin time from
    end_time              = Column(String(20), nullable=True)   # walkin time to
    date_from             = Column(Date, nullable=True)         # walkin date from
    date_upto             = Column(Date, nullable=True)         # walkin date to
    salary_from           = Column(Numeric(10, 2), default=0.0)
    salary_to             = Column(Numeric(10, 2), default=0.0)
    maximum_submission    = Column(Integer, nullable=True)
    requested_date        = Column(Date, nullable=True)
    requested_by          = Column(String(200), nullable=True)
    expected_submission   = Column(Text, nullable=True)
    requirement_type      = Column(String(50), nullable=True)
    job_responsibilities  = Column(Text, nullable=True)
    billable_leaves       = Column(Boolean, nullable=True)
    is_vip                = Column(Boolean, default=False)
    po_opportunity_mrr         = Column(String(200), nullable=True)
    potential_gm               = Column(String(50), nullable=True)
    key_string                 = Column(Text, nullable=True)
    referral_amount            = Column(Integer, nullable=True)
    group_name                 = Column(String(100), nullable=True)
    sub_group                  = Column(String(100), nullable=True)
    # Deferred: the PDF blob is never loaded by list/detail queries — only when
    # explicitly accessed (the questionnaire download endpoint). Prevents loading
    # megabytes of PDF for every job on list/nav queries.
    questionnaire_data         = deferred(Column(LargeBinary, nullable=True))
    questionnaire_generated_at = Column(DateTime, nullable=True)
    questionnaire_notes        = Column(Text, nullable=True)
    assigned_sourcer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_caller_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    sourcer_ids = Column(Text, default="[]")  # JSON array e.g. "[9,6]"
    caller_ids = Column(Text, default="[]")  # JSON array e.g. "[4,8]"
    sourcing_target = Column(Integer, nullable=True)  # how many candidates to source
    kam_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )  # KAM when DL creates
    delivery_lead_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    delivery_lead_ids = Column(Text, default="[]")  # JSON array of DL user IDs
    account_manager_id = Column(
        Integer,
        ForeignKey("account_managers.id"),
        nullable=True,
    )
    deadline = Column(DateTime, nullable=True)
    sourcing_deadline = Column(DateTime, nullable=True)
    calling_deadline = Column(DateTime, nullable=True)
    # Flags to prevent duplicate scheduler alerts
    sourcing_warned = Column(Boolean, default=False)  # 15-min warning sent
    sourcing_alerted = Column(Boolean, default=False)  # overdue alert sent
    calling_warned = Column(Boolean, default=False)
    calling_alerted = Column(Boolean, default=False)
    created_by_id = Column(Integer, ForeignKey("users.id"))
    email_id = Column(
        String(200),
        nullable=True,
    )  # creator's email (snapshot at create time)
    # All emails tied to this job through ANY user-id reference (delivery
    # lead, sourcers, callers, KAM, BH, creator). Kept in sync by
    # SQLAlchemy before_insert / before_update events defined below — so any
    # change to the job's user-FK columns also rewrites this array in the
    # same transaction.
    assigned_email_id = Column(PG_ARRAY(String), nullable=False, server_default="{}")
    is_synced = Column(Boolean, default=False, server_default="false")
    repost_of_job_id    = Column(Integer, nullable=True)   # DB id of the original job this was reposted from
    repost_of_ol_job_id = Column(Integer, nullable=True)   # OL job_id of the original job
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)

    candidates = relationship("Candidate", back_populates="job")
    assigned_sourcer = relationship("User", foreign_keys=[assigned_sourcer_id])
    assigned_caller = relationship("User", foreign_keys=[assigned_caller_id])
    delivery_lead = relationship("User", foreign_keys=[delivery_lead_id])
    business_head = relationship("BusinessHead")
    probing = relationship("ProbingData", foreign_keys=[probing_id])
    client = relationship("Client", foreign_keys=[client_id])


class ProbingData(Base):
    __tablename__ = "probing_data"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, nullable=True)  # optional UI job identifier (numeric)
    reporting_manager_location = Column(Text, nullable=True)
    onsite_opportunities = Column(Text, nullable=True)
    project_size = Column(Text, nullable=True)
    project_count = Column(Text, nullable=True)
    work_mode = Column(Text, nullable=True)
    candidate_role = Column(Text, nullable=True)
    feedback_eta = Column(Text, nullable=True)
    work_location = Column(Text, nullable=True)
    interview_type = Column(Text, nullable=True)
    role_clarity = Column(Text, nullable=True)
    notice_period = Column(Text, nullable=True)
    interview_rounds_count = Column(Text, nullable=True)
    urgency_eta = Column(Text, nullable=True)
    skill_type = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    email_id = Column(String(200), nullable=True)  # creator's email (snapshot)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class Candidate(Base):
    __tablename__ = "candidates"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    # Email of the recruiter who applied this candidate to this job. A single
    # value (not an array) — same person applying to two different jobs is two
    # candidate rows, each with its own applied_by.
    applied_by = Column(String(200), nullable=True)
    full_name = Column(String(200), nullable=False)
    mobile = Column(String(20))
    email = Column(String(200))
    linkedin_url = Column(String(300))
    education = Column(String(100))
    city = Column(String(100))
    exp_range = Column(String(50))
    current_company = Column(String(200))
    skills = Column(Text)
    naukri_active = Column(String(10))
    immediate_joiner = Column(String(10))
    lead_source = Column(String(100))
    resume_data = Column(Text, nullable=True)
    status = Column(
        SAEnum(CandidateStatus, native_enum=False),
        default=CandidateStatus.sourced,
    )
    # Sourcing timestamps
    sourcing_date = Column(String(20))  # YYYY-MM-DD
    pool_added_at = Column(String(10))  # HH:MM timestamp
    call_time = Column(String(10))  # HH:MM timestamp
    validation_done_at = Column(String(10))
    submission_time_ts = Column(String(10))
    feedback_received_at = Column(String(10))
    # Sourcing FK (sourcing_partner role)
    sourced_by_id = Column(Integer, ForeignKey("users.id"))
    assigned_to_id = Column(Integer, ForeignKey("users.id"))
    assigned_validator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    sourced_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)
    rejection_reason = Column(Text, nullable=True)
    rejected_by = Column(String(200), nullable=True)  # e.g. "KAM: Priya Sharma"

    # External system / polymorphic-user fields
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    location = Column(String(200), nullable=True)
    created_by = Column(String(200), nullable=True)
    dl_verified = Column(Boolean, nullable=False, default=False, server_default="false")
    contact_phone = Column(String(30), nullable=True)
    gender = Column(String(20), nullable=True)
    designation = Column(String(200), nullable=True)
    employer = Column(String(200), nullable=True)
    total_experience = Column(Float, nullable=True)
    min_experience = Column(Float, nullable=True)
    max_experience = Column(Float, nullable=True)
    current_ctc = Column(Float, nullable=True)
    expected_ctc = Column(Float, nullable=True)
    resume = Column(Text, nullable=True)
    role_id = Column(Integer, nullable=False, default=4, server_default="4")
    type = Column(
        String(50),
        nullable=False,
        default="UserCandidate",
        server_default="UserCandidate",
    )
    is_synced      = Column(Boolean, default=False, server_default="false")
    is_onboarded   = Column(Boolean, default=False, server_default="false")
    is_benched     = Column(Boolean, default=False, server_default="false")
    is_skills_sync = Column(Boolean, default=False, server_default="false")

    job = relationship("Job", back_populates="candidates")
    sourced_by = relationship(
        "User",
        foreign_keys=[sourced_by_id],
        back_populates="sourced_candidates",
    )
    assigned_to = relationship(
        "User",
        foreign_keys=[assigned_to_id],
        back_populates="assigned_candidates",
    )
    assigned_validator = relationship("User", foreign_keys=[assigned_validator_id])
    call_logs = relationship("CallLog", back_populates="candidate")
    assessment = relationship("Assessment", back_populates="candidate", uselist=False)
    validation = relationship("Validation", back_populates="candidate", uselist=False)
    submission = relationship("Submission", back_populates="candidate", uselist=False)
    consultant_profile = relationship(
        "ConsultantProfile",
        back_populates="candidate",
        uselist=False,
    )
    consultant_mail = relationship(
        "ConsultantMail",
        back_populates="candidate",
        uselist=False,
    )


class CallLog(Base):
    __tablename__ = "call_logs"
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    caller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    call_date = Column(DateTime, default=now_utc)
    outcome = Column(SAEnum(CallOutcome, native_enum=False))
    callback_date = Column(DateTime, nullable=True)
    notes = Column(Text)
    created_at = Column(DateTime, default=now_utc)

    candidate = relationship("Candidate", back_populates="call_logs")
    caller = relationship("User", back_populates="call_logs")


class Assessment(Base):
    __tablename__ = "assessments"
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(
        Integer,
        ForeignKey("candidates.id"),
        unique=True,
        nullable=False,
    )
    caller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Verification basics (Stage A)
    full_name_confirmed = Column(String(200))
    email_verified = Column(String(200))
    alt_phone = Column(String(20))
    linkedin_verified = Column(String(500))
    total_exp = Column(Float)
    relevant_exp = Column(Float)
    qualification = Column(String(100))
    last_company = Column(String(200))
    last_tenure = Column(String(50))
    tenure_from = Column(String(20))
    tenure_to = Column(String(20))
    notice_period_weeks = Column(Integer)
    lwd_confirmed = Column(String(10))
    last_working_day = Column(String(20))
    # Deployment Target
    deploying_client = Column(String(200))
    role_position = Column(String(200))
    primary_skill_stack = Column(Text)
    # CTC
    current_ctc = Column(Float)
    expected_ctc = Column(Float)
    hike_pct = Column(Float)
    # Scores (1-5)
    comm_score = Column(Float)
    self_art_score = Column(Float)
    role_art_score = Column(Float)
    resume_skill_score = Column(Float)
    tech_qa_score = Column(Float)
    paraphrase_score = Column(Float)
    confidence_score = Column(Float)
    gut_score = Column(Float)
    # Stage B extras
    skill_match_last_role = Column(
        String(50),
    )  # Exact match / Strong match / Partial match / Weak match / No match
    tech_q_used = Column(Text)  # which tech question was used
    # Stage D - Availability & Commercials
    project_status = Column(Text)  # Project Status / On-Bench Duration
    open_to_relocation = Column(String(50))  # Already in location / Yes / No
    work_mode_pref = Column(String(50))  # Hybrid-3 days / etc.
    work_auth_status = Column(String(50))  # Indian citizen / etc.
    current_city = Column(String(100))  # residential city
    reason_for_change = Column(Text)
    interviewing_elsewhere = Column(String(10))  # Y/N
    offers_in_hand = Column(String(10))  # 0/1/2/3+
    counter_offer_risk = Column(String(20))  # Low / Medium / High
    last_appraisal_context = Column(Text)
    # Stage Close
    email_acknowledged = Column(String(10))  # Y/N
    validation_slot_locked = Column(String(10))  # Y/N/NA
    # Verdict
    pass_to_validation = Column(
        String(30),
    )  # YES - Strong pass / YES - Borderline / HOLD / NO
    # Auto-computed
    tech_score = Column(Float)
    soft_skill_score = Column(Float)
    overall_score = Column(Float)
    auto_recommendation = Column(SAEnum(AutoRecommendation, native_enum=False))
    red_flags = Column(Text)
    caller_notes = Column(Text)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)

    candidate = relationship("Candidate", back_populates="assessment")
    caller = relationship("User", back_populates="assessments")


class Validation(Base):
    __tablename__ = "validations"
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(
        Integer,
        ForeignKey("candidates.id"),
        unique=True,
        nullable=False,
    )
    delivery_lead_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(SAEnum(ValidationStatus, native_enum=False))
    comments = Column(Text)
    submitted_to_client = Column(String(10))  # Y/N/NA
    submission_date = Column(String(20))
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)

    candidate = relationship("Candidate", back_populates="validation")
    delivery_lead = relationship("User", back_populates="validations")


class ConsultantProfile(Base):
    __tablename__ = "consultant_profiles"
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(
        Integer,
        ForeignKey("candidates.id"),
        unique=True,
        nullable=False,
    )
    resignation_acceptance = Column(String(10))  # Y/N/NA
    replacement_kt_status = Column(String(100))
    personal_laptop = Column(String(10))  # Y/N
    role_responsibilities = Column(Text)
    current_work_location = Column(String(100))
    client_work_location = Column(String(100))
    current_work_timings = Column(String(50))  # General / 9-5 / etc.
    notice_negotiable_upto = Column(String(30))
    payroll = Column(String(100))  # current payroll company
    offers_pipeline = Column(String(10))  # count
    interview_pipeline = Column(String(10))  # count
    dob = Column(String(20))
    telephonic_availability = Column(String(10))  # Y/N
    ide_installed = Column(String(10))  # Y/N
    wifi_connectivity = Column(String(10))  # Y/N
    marital_status = Column(String(30))
    health_issues = Column(Text)
    planned_leaves = Column(Text)
    interview_availability_2d = Column(String(10))  # Y/N
    upcoming_travel = Column(Text)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)

    candidate = relationship("Candidate", back_populates="consultant_profile")


class Submission(Base):
    __tablename__ = "submissions"
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(
        Integer,
        ForeignKey("candidates.id"),
        unique=True,
        nullable=False,
    )
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    delivery_lead_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    submitted_at = Column(DateTime, default=now_utc)
    current_stage = Column(
        SAEnum(InterviewStage, native_enum=False),
        default=InterviewStage.submitted,
    )
    # TA / HM screening
    ta_feedback = Column(String(30))  # Pending / Accepted / Rejected
    hm_feedback = Column(String(30))  # Pending / Shortlisted / Rejected
    tat_window = Column(String(20))  # 24hrs / 24-48hrs / 72hrs
    # Interview rounds
    l1_date = Column(String(30))
    l1_feedback = Column(String(30))  # Cleared / Rejected / Pending
    l1_briefing_done = Column(Boolean, default=False)
    l2_date = Column(String(30))
    l2_feedback = Column(String(30))
    l2_briefing_done = Column(Boolean, default=False)
    final_date = Column(String(30))
    final_feedback = Column(String(30))
    final_briefing_done = Column(Boolean, default=False)
    # Offer
    offered_ctc = Column(Float)
    offer_date = Column(String(20))
    joining_date_confirmed = Column(String(20))
    actual_joining_date = Column(String(20))
    # Candidate risk context
    other_offers_count = Column(String(10))  # 0 / 1 / 2 / 3+
    counter_offer_risk = Column(String(20))  # Low / Medium / High
    # KAM notes & follow-up
    last_notes = Column(Text)
    next_action = Column(Text)
    next_action_date = Column(String(20))
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)

    candidate = relationship("Candidate", back_populates="submission")
    delivery_lead = relationship("User", back_populates="submissions")
    timeline = relationship(
        "SubmissionTimeline",
        back_populates="submission",
        order_by="SubmissionTimeline.created_at",
    )


class SubmissionTimeline(Base):
    __tablename__ = "submission_timeline"
    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False)
    stage = Column(String(60), nullable=False)  # enum value e.g. "l1_scheduled"
    stage_label = Column(String(120))  # display label
    interview_date = Column(String(30))  # ISO datetime for scheduled stages
    feedback = Column(String(30))  # Pass / Fail / Hold
    note = Column(Text)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=now_utc)

    submission = relationship("Submission", back_populates="timeline")
    updated_by = relationship("User")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    notif_type = Column(SAEnum(NotifType, native_enum=False), default=NotifType.general)
    is_read = Column(Boolean, default=False)
    entity_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=now_utc)

    user = relationship("User", back_populates="notifications")


class ConsultantMail(Base):
    __tablename__ = "consultant_mails"
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), unique=True)
    sent_by_id = Column(Integer, ForeignKey("users.id"))
    sent_at = Column(DateTime, default=now_utc)
    exit_date = Column(String(20), nullable=True)
    acknowledgement_received = Column(Boolean, default=False)
    acknowledgement_at = Column(DateTime, nullable=True)
    dl_verified = Column(Boolean, default=False)
    dl_verified_at = Column(DateTime, nullable=True)
    exit_proof = Column(Text, nullable=True)  # base64 data URL

    candidate = relationship("Candidate", back_populates="consultant_mail")
    sent_by = relationship("User")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String(100))
    entity_type = Column(String(100))
    entity_id = Column(Integer)
    detail = Column(Text)
    created_at = Column(DateTime, default=now_utc)


class UserLeave(Base):
    __tablename__ = "user_leaves"
    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_date  = Column(Date, nullable=False)
    marked_by   = Column(Integer, ForeignKey("users.id"), nullable=True)
    note        = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=now_utc)
    __table_args__ = (UniqueConstraint("user_id", "leave_date", name="uq_user_leave_date"),)


class ClientEmail(Base):
    __tablename__ = "client_emails"
    id            = Column(Integer, primary_key=True, index=True)
    job_id        = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    subject       = Column(Text, nullable=True)
    email_html    = Column(Text, nullable=True)
    email_json    = Column(Text, nullable=True)  # raw AI JSON
    created_at    = Column(DateTime, default=now_utc)

    job        = relationship("Job", foreign_keys=[job_id])
    created_by = relationship("User", foreign_keys=[created_by_id])


# ── Job.assigned_email_id auto-refresh ────────────────────────────────────────
# Recompute `Job.assigned_email_id` from the union of every user-id column on
# the job whenever the row is inserted or updated. Lives at module scope so
# the import side-effect of `infra.models` registers the listeners once.
import json as _json  # noqa: E402
from sqlalchemy import event as _sa_event  # noqa: E402


def _job_assignee_user_ids(job: "Job") -> set[int]:
    """Union of every user id this job references (single FKs + JSON arrays)."""
    ids: set[int] = set()
    for col in (
        "delivery_lead_id",
        "assigned_sourcer_id",
        "assigned_caller_id",
        "kam_id",
        "account_manager_id",   # business head, repurposed FK
        "created_by_id",
    ):
        v = getattr(job, col, None)
        if v:
            try:
                ids.add(int(v))
            except (TypeError, ValueError):
                pass
    for col in ("delivery_lead_ids", "sourcer_ids", "caller_ids"):
        raw = getattr(job, col, None)
        if not raw:
            continue
        try:
            parsed = _json.loads(raw) if isinstance(raw, str) else raw
            for x in parsed or []:
                if x is None:
                    continue
                try:
                    ids.add(int(x))
                except (TypeError, ValueError):
                    pass
        except (ValueError, TypeError):
            continue
    return ids


def _refresh_job_assigned_emails(_mapper, connection, target: "Job") -> None:
    """before_insert / before_update hook: rewrite target.assigned_email_id
    from the current user-id columns. Runs inside the same transaction as the
    save so the column is never stale relative to the row's other fields."""
    from sqlalchemy import text as _text
    ids = _job_assignee_user_ids(target)
    if not ids:
        target.assigned_email_id = []
        return
    rows = connection.execute(
        _text(
            "SELECT DISTINCT email FROM users "
            "WHERE id = ANY(:ids) AND email IS NOT NULL AND email <> '' "
            "ORDER BY email"
        ),
        {"ids": list(ids)},
    ).fetchall()
    target.assigned_email_id = [r[0] for r in rows]


_sa_event.listen(Job, "before_insert", _refresh_job_assigned_emails)
_sa_event.listen(Job, "before_update", _refresh_job_assigned_emails)
