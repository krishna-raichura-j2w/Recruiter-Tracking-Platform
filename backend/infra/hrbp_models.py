from datetime import datetime, timezone

from core.database import Base
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    SmallInteger,
    Table,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB


def _now():
    return datetime.now(timezone.utc)


class HRBPKraDefinition(Base):
    __tablename__ = "hrbp_kra_definitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kra_code = Column(Text, unique=True, nullable=False)
    name = Column(Text, nullable=False)
    description = Column(Text)
    what_you_own = Column(Text)
    target = Column(Text)
    revenue_consequence = Column(Text)
    control_level = Column(Text)
    sop_refs = Column(ARRAY(Text))
    created_at = Column(DateTime(timezone=True), default=_now)


class HRBPEmailTemplate(Base):
    __tablename__ = "hrbp_email_templates"

    id = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    group_name = Column(Text, nullable=False)
    channel = Column(ARRAY(Text), nullable=False)
    subject_tpl = Column(Text)
    body_tpl = Column(Text, nullable=False)
    required_vars = Column(ARRAY(Text))
    forbidden_words = Column(ARRAY(Text))
    locked_cc = Column(ARRAY(Text))
    sop_step_ref = Column(ARRAY(Text))
    kra_ref = Column(ARRAY(Text))
    send_direction = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class HRBPSopDefinition(Base):
    __tablename__ = "hrbp_sop_definitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sop_type = Column(Text, unique=True, nullable=False)
    number = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    description = Column(Text)
    trigger_source = Column(Text, nullable=False)
    kra_tags = Column(ARRAY(Text))
    control_level = Column(Text, nullable=False)
    email_templates = Column(ARRAY(Text))
    persons_hierarchy = Column(JSONB, nullable=False)
    steps_definition = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)


class HRBPSignalDefinition(Base):
    __tablename__ = "hrbp_signal_definitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    signal_code = Column(Text, unique=True, nullable=False)
    number = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    source = Column(Text, nullable=False)
    description = Column(Text)
    indicators = Column(ARRAY(Text), nullable=False)
    auto_action = Column(Text)
    auto_sop_trigger = Column(Text)  # soft ref to hrbp_sop_definitions.sop_type
    threshold_count = Column(SmallInteger)
    urgency = Column(Text)
    created_at = Column(DateTime(timezone=True), default=_now)


class HRBPClient(Base):
    __tablename__ = "hrbp_clients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    industry = Column(Text)
    bh_id = Column(Integer, ForeignKey("users.id"))
    hrbp_id = Column(Integer, ForeignKey("users.id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class HRBPConsultant(Base):
    __tablename__ = "hrbp_consultants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    emp_id = Column(Text, unique=True, nullable=False)
    name = Column(Text, nullable=False)
    email = Column(Text)
    phone = Column(Text)
    client_id = Column(Integer, ForeignKey("hrbp_clients.id"), nullable=False)
    hrbp_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    manager_name = Column(Text)
    modality = Column(Text)
    skill = Column(Text)
    cohort = Column(Text)
    perf_tier = Column(Text)
    monthly_po = Column(Numeric(12, 2))
    monthly_ctc = Column(Numeric(12, 2))
    yearly_ctc = Column(Numeric(14, 2))
    designation = Column(Text)
    margin = Column(Numeric(14, 2))
    po_end_date = Column(Date)
    join_date = Column(Date)
    bh_feedback = Column(Text)
    nps_score = Column(SmallInteger)
    last_hike_date = Column(Date)
    last_hike_pct = Column(Numeric(5, 2))
    l_d_status = Column(Text)
    po_risk = Column(Numeric(14, 2))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class HRBPIncident(Base):
    __tablename__ = "hrbp_incidents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_ref = Column(Text, unique=True)
    consultant_id = Column(Integer, ForeignKey("hrbp_consultants.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("hrbp_clients.id"), nullable=False)
    opened_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    sop_type = Column(Text, ForeignKey("hrbp_sop_definitions.sop_type"), nullable=False)
    kra_tags = Column(ARRAY(Text))
    risk_level = Column(Text)
    status = Column(Text, default="open")
    current_step = Column(SmallInteger, default=1)
    description = Column(Text)
    source = Column(Text)
    source_email_id = Column(Integer)
    opened_at = Column(DateTime(timezone=True), default=_now)
    resolved_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class HRBPSopStep(Base):
    __tablename__ = "hrbp_sop_steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    incident_id = Column(
        Integer,
        ForeignKey("hrbp_incidents.id", ondelete="CASCADE"),
        nullable=False,
    )
    step_number = Column(SmallInteger, nullable=False)
    action_label = Column(Text, nullable=False)
    action_detail = Column(Text)
    owner_role = Column(Text, nullable=False)
    owner_user_id = Column(Integer, ForeignKey("users.id"))
    sla_working_hours = Column(SmallInteger, nullable=False)
    due_at = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    escalated_at = Column(DateTime(timezone=True))
    escalated_to_role = Column(Text)
    escalated_to_user = Column(Integer, ForeignKey("users.id"))
    status = Column(Text, default="pending")
    completion_notes = Column(Text)
    completed_by = Column(Integer, ForeignKey("users.id"))
    email_template_id = Column(Text, ForeignKey("hrbp_email_templates.id"))
    hard_gate = Column(Text)
    hard_gate_cleared = Column(Boolean, default=False)
    kra_ref = Column(Text)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class HRBPEmail(Base):
    __tablename__ = "hrbp_emails"

    id = Column(Integer, primary_key=True, autoincrement=True)
    direction = Column(Text, nullable=False)
    consultant_id = Column(Integer, ForeignKey("hrbp_consultants.id"))
    incident_id = Column(Integer, ForeignKey("hrbp_incidents.id"))
    from_address = Column(Text, nullable=False)
    to_addresses = Column(ARRAY(Text), nullable=False)
    cc_addresses = Column(ARRAY(Text))
    subject = Column(Text)
    body_raw = Column(Text)
    body_parsed = Column(Text)
    template_id = Column(Text, ForeignKey("hrbp_email_templates.id"))
    intent = Column(Text)
    sop_type_mapped = Column(Text)
    sent_at = Column(DateTime(timezone=True))
    received_at = Column(DateTime(timezone=True))
    processed = Column(Boolean, default=False)
    outlook_msg_id = Column(Text)
    created_at = Column(DateTime(timezone=True), default=_now)


class HRBPSignal(Base):
    __tablename__ = "hrbp_signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    consultant_id = Column(Integer, ForeignKey("hrbp_consultants.id"), nullable=False)
    logged_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    signal_type = Column(Text, nullable=False)
    description = Column(Text, nullable=False)
    risk_score = Column(SmallInteger)
    action_taken = Column(Text)
    incident_id = Column(Integer, ForeignKey("hrbp_incidents.id"))
    logged_at = Column(DateTime(timezone=True), default=_now)


class HRBPRoutineSchedule(Base):
    __tablename__ = "hrbp_routine_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    consultant_id = Column(Integer, ForeignKey("hrbp_consultants.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=False)
    task_type = Column(Text, nullable=False)
    sop_ref = Column(Text)
    kra_ref = Column(Text)
    email_template_id = Column(Text, ForeignKey("hrbp_email_templates.id"))
    due_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True))
    completed_by = Column(Integer, ForeignKey("users.id"))
    status = Column(Text, default="pending")
    recurrence_days = Column(SmallInteger)
    next_due_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class HRBPNpsSurvey(Base):
    __tablename__ = "hrbp_nps_surveys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    consultant_id = Column(Integer, ForeignKey("hrbp_consultants.id"), nullable=False)
    survey_type = Column(Text)
    q1_project_score = Column(SmallInteger)
    q2_changes = Column(Text)
    q3_happiness = Column(SmallInteger)
    q4_help_needed = Column(Text)
    q5_open = Column(Text)
    dispatched_at = Column(DateTime(timezone=True), default=_now)
    responded_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=_now)


class HRBPAuditLog(Base):
    __tablename__ = "hrbp_audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(Text, nullable=False)
    entity_id = Column(Integer, nullable=False)
    action = Column(Text, nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"))
    old_value = Column(JSONB)
    new_value = Column(JSONB)
    ts = Column(DateTime(timezone=True), default=_now)


class HRBPCadenceSchedule(Base):
    __tablename__ = "hrbp_cadence_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(Integer, ForeignKey("hrbp_clients.id"), nullable=False)
    consultant_id = Column(Integer, ForeignKey("hrbp_consultants.id"), nullable=False)
    hrbp_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    bh_id = Column(Integer, ForeignKey("users.id"))
    meeting_type = Column(Text, nullable=False)  # "one_time" | "recurring"
    project_name = Column(Text)
    meeting_time = Column(Time)
    duration_minutes = Column(SmallInteger, default=30)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)  # required for recurring
    frequency_weeks = Column(SmallInteger, default=1)
    status = Column(
        Text,
        default="not_started",
    )  # not_started | in_progress | completed | cancelled
    supporting_documents = Column(ARRAY(Text), default=list)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


# ── Tickets module ──────────────────────────────────────────────────────────

# Association table for ticket ↔ consultant (many-to-many)
hrbp_ticket_consultants = Table(
    "hrbp_ticket_consultants",
    Base.metadata,
    Column("ticket_id",    Integer, ForeignKey("hrbp_tickets.id",     ondelete="CASCADE"), primary_key=True),
    Column("consultant_id", Integer, ForeignKey("hrbp_consultants.id"), primary_key=True),
)


class HRBPTicket(Base):
    __tablename__ = "hrbp_tickets"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    ticket_number     = Column(Text, unique=True, nullable=False)
    title             = Column(Text, nullable=False)
    raised_by_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    escalation_mgr_id = Column(Integer, ForeignKey("users.id"))
    client_id         = Column(Integer, ForeignKey("hrbp_clients.id"), nullable=False)
    sop_id            = Column(Integer, ForeignKey("hrbp_sop_definitions.id"))
    priority          = Column(Text, nullable=False, default="medium")
    sla_deadline      = Column(DateTime(timezone=True))
    sla_alerted_at    = Column(DateTime(timezone=True))
    description       = Column(Text)
    po_risk_amount    = Column(Numeric(14, 2))
    status            = Column(Text, nullable=False, default="open")
    hierarchy_json    = Column(JSONB, nullable=False, default=list)
    current_step      = Column(SmallInteger, nullable=False, default=1)
    attachments       = Column(ARRAY(Text), nullable=False, default=list)
    step_started_at      = Column(DateTime(timezone=True))
    step_sla_alerted_at  = Column(DateTime(timezone=True))
    step_sla_extended_until = Column(DateTime(timezone=True))
    closed_at         = Column(DateTime(timezone=True))
    created_at        = Column(DateTime(timezone=True), default=_now)
    updated_at        = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class HRBPTicketComment(Base):
    __tablename__ = "hrbp_ticket_comments"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id      = Column(Integer, ForeignKey("hrbp_tickets.id", ondelete="CASCADE"), nullable=False)
    author_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    hierarchy_step = Column(SmallInteger, nullable=False)
    content        = Column(Text, nullable=False)
    is_resolution  = Column(Boolean, nullable=False, default=False)
    created_at     = Column(DateTime(timezone=True), default=_now)


class HRBPTicketActivityLog(Base):
    __tablename__ = "hrbp_ticket_activity_log"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id   = Column(Integer, ForeignKey("hrbp_tickets.id", ondelete="CASCADE"), nullable=False)
    actor_id    = Column(Integer, ForeignKey("users.id"))
    action      = Column(Text, nullable=False)
    meta_data   = Column("metadata", JSONB, nullable=False, default=dict)
    created_at  = Column(DateTime(timezone=True), default=_now)


class HRBPNotificationHistory(Base):
    __tablename__ = "hrbp_notification_history"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticket_id  = Column(Integer, ForeignKey("hrbp_tickets.id", ondelete="SET NULL"))
    title      = Column(Text, nullable=False)
    message    = Column(Text, nullable=False)
    notif_type = Column(Text, nullable=False, default="general")
    is_read    = Column(Boolean, nullable=False, default=False)
    read_at    = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=_now)


# ────────────────────────────────────────────────────────────────────────────

class HRBPExitTracking(Base):
    __tablename__ = "hrbp_exit_tracking"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    consultant_id       = Column(Integer, ForeignKey("hrbp_consultants.id"), nullable=False)
    client_id           = Column(Integer, ForeignKey("hrbp_clients.id"), nullable=False)
    initiated_by_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    exit_date           = Column(Date)
    notice_period_start = Column(Date)
    exit_reason         = Column(Text, nullable=False)
    exit_type           = Column(Text, nullable=False)
    po_impact           = Column(Numeric(14, 2))
    status              = Column(Text, nullable=False, default="initiated")
    replacement_needed  = Column(Boolean, nullable=False, default=False)
    notes               = Column(Text)
    source_ticket_id    = Column(Integer, ForeignKey("hrbp_tickets.id", ondelete="SET NULL"), nullable=True)
    created_at          = Column(DateTime(timezone=True), default=_now)
    updated_at          = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class HRBPPoRevision(Base):
    __tablename__ = "hrbp_po_revisions"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    consultant_id   = Column(Integer, ForeignKey("hrbp_consultants.id", ondelete="CASCADE"), nullable=False)
    client_id       = Column(Integer, ForeignKey("hrbp_clients.id"), nullable=False)
    hrbp_id         = Column(Integer, ForeignKey("users.id"))
    bh_id           = Column(Integer, ForeignKey("users.id"))
    revised_at      = Column(Date, nullable=False)
    old_po_rate     = Column(Numeric(12, 2))
    new_po_rate     = Column(Numeric(12, 2), nullable=False)
    hike_pct        = Column(Numeric(5, 2))
    ticket_id       = Column(Integer, ForeignKey("hrbp_tickets.id", ondelete="SET NULL"))
    ticket_number   = Column(Text)
    status          = Column(Text, nullable=False, default="pending_approval")
    notes           = Column(Text)
    created_by_id   = Column(Integer, ForeignKey("users.id"))
    created_at      = Column(DateTime(timezone=True), default=_now)
    updated_at      = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class HRBPUserPinnedTicket(Base):
    __tablename__ = "hrbp_user_pinned_tickets"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    ticket_id  = Column(Integer, ForeignKey("hrbp_tickets.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)


class HRBPCadenceSession(Base):
    __tablename__ = "hrbp_cadence_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(
        Integer,
        ForeignKey("hrbp_cadence_schedules.id", ondelete="CASCADE"),
        nullable=False,
    )
    cadence_number = Column(SmallInteger, nullable=False)
    scheduled_date = Column(Date, nullable=False)
    status = Column(Text, default="not_started")  # not_started | completed | cancelled
    comments = Column(Text)
    rca_status = Column(Text)
    supporting_documents = Column(ARRAY(Text), default=list)
    completed_at = Column(DateTime(timezone=True))
    completed_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)
