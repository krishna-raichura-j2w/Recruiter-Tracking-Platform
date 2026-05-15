import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from core.database import get_db, SessionLocal
from core.deps import get_current_user, require_roles
from sqlalchemy.orm import Session

router = APIRouter(prefix="/form-config", tags=["form-config"])

# ── Default templates ─────────────────────────────────────────────────────────

_DEFAULTS: dict[str, dict] = {
    "caller_assessment": {
        "form_name": "caller_assessment",
        "label":     "Caller Assessment",
        "sections": [
            {
                "id": "stage_a",
                "label": "Stage A — Verification",
                "order": 0,
                "fields": [
                    {"id":"full_name_confirmed","label":"Full Name Confirmed",          "type":"text",  "required":False,"visible":True,"db_column":"full_name_confirmed","options":[],"placeholder":"Confirmed spelling"},
                    {"id":"email_verified",     "label":"Verify Email",                 "type":"text",  "required":False,"visible":True,"db_column":"email_verified",     "options":[],"placeholder":""},
                    {"id":"alt_phone",          "label":"Alternate Number",             "type":"text",  "required":False,"visible":True,"db_column":"alt_phone",          "options":[],"placeholder":""},
                    {"id":"linkedin_verified",  "label":"Verify / Update LinkedIn",     "type":"text",  "required":False,"visible":True,"db_column":"linkedin_verified",  "options":[],"placeholder":""},
                    {"id":"total_exp",          "label":"Total Experience",             "type":"select","required":False,"visible":True,"db_column":"total_exp",          "options":["0-1 yr","1-3 yrs","3-5 yrs","5-8 yrs","8-12 yrs","12-15 yrs","15+ yrs"],"placeholder":""},
                    {"id":"relevant_exp",       "label":"Relevant Experience",          "type":"select","required":False,"visible":True,"db_column":"relevant_exp",       "options":["0-1 yr","1-3 yrs","3-5 yrs","5-8 yrs","8-12 yrs","12-15 yrs","15+ yrs"],"placeholder":""},
                    {"id":"qualification",      "label":"Highest Qualification",        "type":"select","required":False,"visible":True,"db_column":"qualification",      "options":["B.Tech/BE","M.Tech/ME","BCA","MCA","B.Sc","M.Sc","MBA","PhD","Diploma","Other"],"placeholder":""},
                    {"id":"last_company",       "label":"Last Company",                 "type":"text",  "required":False,"visible":True,"db_column":"last_company",       "options":[],"placeholder":""},
                    {"id":"last_tenure",        "label":"Last Tenure",                  "type":"select","required":False,"visible":True,"db_column":"last_tenure",        "options":["< 6 months","6m-1yr","1-2 yrs","2-3 yrs","3-5 yrs","5+ yrs"],"placeholder":""},
                    {"id":"notice_period_weeks","label":"Notice Period (weeks)",        "type":"number","required":False,"visible":True,"db_column":"notice_period_weeks","options":[],"placeholder":"e.g. 4"},
                    {"id":"lwd_confirmed",      "label":"LWD Confirmed",               "type":"text",  "required":False,"visible":True,"db_column":"lwd_confirmed",      "options":[],"placeholder":"Yes / No"},
                    {"id":"last_working_day",   "label":"Last Working Day",             "type":"date",  "required":False,"visible":True,"db_column":"last_working_day",   "options":[],"placeholder":""},
                ],
            },
            {
                "id": "stage_b",
                "label": "Stage B — Role Fit & CTC",
                "order": 1,
                "fields": [
                    {"id":"deploying_client",      "label":"Deploying Client",           "type":"text",  "required":False,"visible":True,"db_column":"deploying_client",      "options":[],"placeholder":""},
                    {"id":"role_position",         "label":"Role / Position",            "type":"text",  "required":False,"visible":True,"db_column":"role_position",         "options":[],"placeholder":""},
                    {"id":"primary_skill_stack",   "label":"Primary Skill Stack",        "type":"text",  "required":False,"visible":True,"db_column":"primary_skill_stack",   "options":[],"placeholder":""},
                    {"id":"current_ctc",           "label":"Current CTC (LPA)",          "type":"number","required":False,"visible":True,"db_column":"current_ctc",           "options":[],"placeholder":"e.g. 12.5"},
                    {"id":"expected_ctc",          "label":"Expected CTC (LPA)",         "type":"number","required":False,"visible":True,"db_column":"expected_ctc",          "options":[],"placeholder":"e.g. 18"},
                    {"id":"skill_match_last_role", "label":"Skill Match in Last Role",   "type":"text",  "required":False,"visible":True,"db_column":"skill_match_last_role", "options":[],"placeholder":""},
                    {"id":"tech_q_used",           "label":"Tech Questions Used",        "type":"text",  "required":False,"visible":True,"db_column":"tech_q_used",           "options":[],"placeholder":""},
                    {"id":"self_art_score",        "label":"Self Articulation (1-5)",    "type":"score", "required":False,"visible":True,"db_column":"self_art_score",        "options":[],"placeholder":""},
                    {"id":"role_art_score",        "label":"Role Articulation (1-5)",    "type":"score", "required":False,"visible":True,"db_column":"role_art_score",        "options":[],"placeholder":""},
                    {"id":"resume_skill_score",    "label":"Resume-Skill Match (1-5)",   "type":"score", "required":False,"visible":True,"db_column":"resume_skill_score",    "options":[],"placeholder":""},
                    {"id":"tech_qa_score",         "label":"Live Tech Q&A (1-5)",        "type":"score", "required":False,"visible":True,"db_column":"tech_qa_score",         "options":[],"placeholder":""},
                ],
            },
            {
                "id": "stage_c",
                "label": "Stage C — Engagement Model",
                "order": 2,
                "fields": [
                    {"id":"paraphrase_score","label":"Paraphrasing / Deployment Model (1-5)","type":"score","required":False,"visible":True,"db_column":"paraphrase_score","options":[],"placeholder":""},
                ],
            },
            {
                "id": "stage_d",
                "label": "Stage D — Availability & Commercials",
                "order": 3,
                "fields": [
                    {"id":"project_status",        "label":"Project Status",             "type":"text",  "required":False,"visible":True,"db_column":"project_status",        "options":[],"placeholder":"e.g. Bench since Jan"},
                    {"id":"open_to_relocation",    "label":"Open to Relocation",         "type":"text",  "required":False,"visible":True,"db_column":"open_to_relocation",    "options":[],"placeholder":"Yes / No / City"},
                    {"id":"work_mode_pref",        "label":"Work Mode Preference",       "type":"text",  "required":False,"visible":True,"db_column":"work_mode_pref",        "options":[],"placeholder":""},
                    {"id":"work_auth_status",      "label":"Work Auth Status",           "type":"text",  "required":False,"visible":True,"db_column":"work_auth_status",      "options":[],"placeholder":""},
                    {"id":"current_city",          "label":"Current Residential City",   "type":"text",  "required":False,"visible":True,"db_column":"current_city",          "options":[],"placeholder":""},
                    {"id":"reason_for_change",     "label":"Reason for Change",          "type":"select","required":False,"visible":True,"db_column":"reason_for_change",     "options":["Growth","CTC","Location","Company stability","Management","Other"],"placeholder":""},
                    {"id":"interviewing_elsewhere", "label":"Interviewing Elsewhere",    "type":"text",  "required":False,"visible":True,"db_column":"interviewing_elsewhere", "options":[],"placeholder":"Yes / No + details"},
                    {"id":"offers_in_hand",        "label":"Offers in Hand",             "type":"text",  "required":False,"visible":True,"db_column":"offers_in_hand",        "options":[],"placeholder":""},
                    {"id":"counter_offer_risk",    "label":"Counter Offer Risk",         "type":"text",  "required":False,"visible":True,"db_column":"counter_offer_risk",    "options":[],"placeholder":"Low / Medium / High"},
                    {"id":"last_appraisal_context","label":"Last Appraisal Context",     "type":"text",  "required":False,"visible":True,"db_column":"last_appraisal_context","options":[],"placeholder":""},
                ],
            },
            {
                "id": "close",
                "label": "Close & Scores",
                "order": 4,
                "fields": [
                    {"id":"email_acknowledged",     "label":"Email Acknowledged",         "type":"text", "required":False,"visible":True,"db_column":"email_acknowledged",     "options":[],"placeholder":"Yes / No"},
                    {"id":"validation_slot_locked", "label":"Validation Slot Locked",     "type":"text", "required":False,"visible":True,"db_column":"validation_slot_locked", "options":[],"placeholder":"Yes / No + time"},
                    {"id":"comm_score",             "label":"Communication Overall (1-5)","type":"score","required":False,"visible":True,"db_column":"comm_score",             "options":[],"placeholder":""},
                    {"id":"confidence_score",       "label":"Confidence & Energy (1-5)",  "type":"score","required":False,"visible":True,"db_column":"confidence_score",       "options":[],"placeholder":""},
                    {"id":"gut_score",              "label":"Gut Score (1-5)",            "type":"score","required":False,"visible":True,"db_column":"gut_score",             "options":[],"placeholder":""},
                    {"id":"pass_to_validation",     "label":"Pass to Validation",         "type":"text", "required":False,"visible":True,"db_column":"pass_to_validation",     "options":[],"placeholder":"Yes / No"},
                    {"id":"caller_notes",           "label":"Caller Notes",               "type":"textarea","required":False,"visible":True,"db_column":"caller_notes",        "options":[],"placeholder":"Additional observations…"},
                ],
            },
        ],
    },
    "jd_upload": {
        "form_name": "jd_upload",
        "label":     "JD Upload (KAM)",
        "sections": [
            {
                "id": "demand_info",
                "label": "Demand Information",
                "order": 0,
                "fields": [
                    {"id":"client_name",        "label":"Client *",           "type":"text",  "required":True, "visible":True,"db_column":"client_name",        "options":[],"placeholder":"e.g. Infosys"},
                    {"id":"client_job_id",      "label":"Job ID *",           "type":"text",  "required":True, "visible":True,"db_column":"client_job_id",      "options":[],"placeholder":"e.g. JD-2026-001"},
                    {"id":"demand_source",      "label":"Demand Source *",    "type":"select","required":True, "visible":True,"db_column":"demand_source",      "options":["Customer Tool","Email","WhatsApp","Phone Call","Portal","Referral","Other"],"placeholder":""},
                    {"id":"demand_type",        "label":"Demand Type *",      "type":"select","required":True, "visible":True,"db_column":"demand_type",        "options":["New","Backfill","Replacement"],"placeholder":""},
                    {"id":"demand_exclusivity", "label":"Exclusivity *",      "type":"select","required":True, "visible":True,"db_column":"demand_exclusivity", "options":["Exclusive","Open"],"placeholder":""},
                ],
            },
            {
                "id": "job_details",
                "label": "Job Details",
                "order": 1,
                "fields": [
                    {"id":"role_title",    "label":"Role Title *",      "type":"text",  "required":True, "visible":True,"db_column":"role_title",    "options":[],"placeholder":"e.g. Senior Software Engineer"},
                    {"id":"work_mode",     "label":"Work Mode",         "type":"select","required":False,"visible":True,"db_column":"work_mode",     "options":["Remote","Onsite","Hybrid (2 days)","Hybrid (3 days)","Flexible"],"placeholder":""},
                    {"id":"location",      "label":"Location",          "type":"text",  "required":False,"visible":True,"db_column":"location",      "options":[],"placeholder":"e.g. Bangalore, Chennai"},
                    {"id":"skill_stack",   "label":"Skill Stack",       "type":"text",  "required":False,"visible":True,"db_column":"skill_stack",   "options":[],"placeholder":"e.g. React, TypeScript"},
                    {"id":"min_experience","label":"Min Experience (yrs)","type":"number","required":False,"visible":True,"db_column":"min_experience","options":[],"placeholder":"e.g. 3"},
                    {"id":"max_experience","label":"Max Experience (yrs)","type":"number","required":False,"visible":True,"db_column":"max_experience","options":[],"placeholder":"e.g. 8"},
                    {"id":"headcount",     "label":"Headcount *",       "type":"number","required":True, "visible":True,"db_column":"headcount",     "options":[],"placeholder":"e.g. 2"},
                    {"id":"salary_range",  "label":"Salary Range",      "type":"text",  "required":False,"visible":True,"db_column":"salary_range",  "options":[],"placeholder":"e.g. 15–25 LPA"},
                    {"id":"work_auth",     "label":"Work Authorization", "type":"text",  "required":False,"visible":True,"db_column":"work_auth",     "options":[],"placeholder":""},
                    {"id":"deadline",      "label":"Deadline",          "type":"date",  "required":False,"visible":True,"db_column":"deadline",      "options":[],"placeholder":""},
                    {"id":"jd_summary",    "label":"JD Summary",        "type":"textarea","required":False,"visible":True,"db_column":"jd_summary",  "options":[],"placeholder":"Brief summary of the role"},
                ],
            },
        ],
    },
    "interview_tracking": {
        "form_name": "interview_tracking",
        "label":     "Interview Tracking",
        "sections": [
            {
                "id": "client_screening",
                "label": "Client Screening",
                "order": 0,
                "fields": [
                    {"id":"ta_feedback", "label":"TA Feedback",  "type":"select","required":False,"visible":True,"db_column":"ta_feedback", "options":["Pending","Accepted","Rejected"],           "placeholder":""},
                    {"id":"hm_feedback", "label":"HM Feedback",  "type":"select","required":False,"visible":True,"db_column":"hm_feedback", "options":["Pending","Shortlisted","Rejected"],        "placeholder":""},
                    {"id":"tat_window",  "label":"TAT Window",   "type":"select","required":False,"visible":True,"db_column":"tat_window",  "options":["24 hrs","24–48 hrs","72 hrs"],            "placeholder":""},
                ],
            },
            {
                "id": "l1_round",
                "label": "L1 Round",
                "order": 1,
                "fields": [
                    {"id":"l1_date",          "label":"L1 Date",                    "type":"date",  "required":False,"visible":True,"db_column":"l1_date",          "options":[],"placeholder":""},
                    {"id":"l1_feedback",      "label":"L1 Feedback",                "type":"select","required":False,"visible":True,"db_column":"l1_feedback",      "options":["Pending","Cleared","Rejected","Hold"],"placeholder":""},
                    {"id":"l1_briefing_done", "label":"Candidate Briefed Before L1","type":"select","required":False,"visible":True,"db_column":"l1_briefing_done", "options":["Yes","No"],          "placeholder":""},
                ],
            },
            {
                "id": "l2_round",
                "label": "L2 Round",
                "order": 2,
                "fields": [
                    {"id":"l2_date",          "label":"L2 Date",                    "type":"date",  "required":False,"visible":True,"db_column":"l2_date",          "options":[],"placeholder":""},
                    {"id":"l2_feedback",      "label":"L2 Feedback",                "type":"select","required":False,"visible":True,"db_column":"l2_feedback",      "options":["Pending","Cleared","Rejected","Hold"],"placeholder":""},
                    {"id":"l2_briefing_done", "label":"Candidate Briefed Before L2","type":"select","required":False,"visible":True,"db_column":"l2_briefing_done", "options":["Yes","No"],          "placeholder":""},
                ],
            },
            {
                "id": "final_round",
                "label": "Final Round",
                "order": 3,
                "fields": [
                    {"id":"final_date",          "label":"Final Round Date",                    "type":"date",  "required":False,"visible":True,"db_column":"final_date",          "options":[],"placeholder":""},
                    {"id":"final_feedback",      "label":"Final Feedback",                      "type":"select","required":False,"visible":True,"db_column":"final_feedback",      "options":["Pending","Cleared","Rejected","Hold"],"placeholder":""},
                    {"id":"final_briefing_done", "label":"Candidate Briefed Before Final Round","type":"select","required":False,"visible":True,"db_column":"final_briefing_done", "options":["Yes","No"],          "placeholder":""},
                ],
            },
            {
                "id": "offer_joining",
                "label": "Offer & Joining",
                "order": 4,
                "fields": [
                    {"id":"offered_ctc",            "label":"Offered CTC (Lakhs)",      "type":"number","required":False,"visible":True,"db_column":"offered_ctc",            "options":[],"placeholder":"e.g. 18.5"},
                    {"id":"offer_date",             "label":"Offer Date",               "type":"date",  "required":False,"visible":True,"db_column":"offer_date",             "options":[],"placeholder":""},
                    {"id":"joining_date_confirmed", "label":"Joining Date (Confirmed)", "type":"date",  "required":False,"visible":True,"db_column":"joining_date_confirmed", "options":[],"placeholder":""},
                    {"id":"actual_joining_date",    "label":"Actual Joining Date",      "type":"date",  "required":False,"visible":True,"db_column":"actual_joining_date",    "options":[],"placeholder":""},
                ],
            },
            {
                "id": "risk_notes",
                "label": "Risk & Notes",
                "order": 5,
                "fields": [
                    {"id":"other_offers_count","label":"Other Offers in Hand",  "type":"select",  "required":False,"visible":True,"db_column":"other_offers_count","options":["0","1","2","3+"],        "placeholder":""},
                    {"id":"counter_offer_risk","label":"Counter-Offer Risk",    "type":"select",  "required":False,"visible":True,"db_column":"counter_offer_risk","options":["Low","Medium","High"],    "placeholder":""},
                    {"id":"last_notes",        "label":"Feedback / Notes",      "type":"textarea","required":True, "visible":True,"db_column":"last_notes",        "options":[],                          "placeholder":"Required — add your feedback or update notes…"},
                    {"id":"next_action",       "label":"Next Action",           "type":"text",    "required":False,"visible":True,"db_column":"next_action",       "options":[],"placeholder":"e.g. Lock L2 slot"},
                    {"id":"next_action_date",  "label":"Action By Date",        "type":"date",    "required":False,"visible":True,"db_column":"next_action_date",  "options":[],"placeholder":""},
                ],
            },
        ],
    },
    "sourcer_form": {
        "form_name": "sourcer_form",
        "label":     "Sourcer / Candidate Form",
        "sections": [
            {
                "id": "basic",
                "label": "Basic Information",
                "order": 0,
                "fields": [
                    {"id":"full_name",       "label":"Full Name",           "type":"text",  "required":True, "visible":True,"db_column":"full_name",       "options":[],"placeholder":""},
                    {"id":"mobile",          "label":"Mobile",              "type":"text",  "required":False,"visible":True,"db_column":"mobile",          "options":[],"placeholder":""},
                    {"id":"email",           "label":"Email",               "type":"text",  "required":False,"visible":True,"db_column":"email",           "options":[],"placeholder":""},
                    {"id":"linkedin_url",    "label":"LinkedIn URL",        "type":"text",  "required":False,"visible":True,"db_column":"linkedin_url",    "options":[],"placeholder":""},
                    {"id":"education",       "label":"Education",           "type":"select","required":False,"visible":True,"db_column":"education",       "options":["B.Tech/BE","M.Tech/ME","BCA","MCA","B.Sc","M.Sc","B.Com","MBA","Diploma","PhD","Other"],"placeholder":""},
                    {"id":"city",            "label":"City",                "type":"select","required":False,"visible":True,"db_column":"city",            "options":["Bangalore","Hyderabad","Chennai","Mumbai","Delhi","Pune","Noida","Other"],"placeholder":""},
                    {"id":"exp_range",       "label":"Experience Range",    "type":"select","required":False,"visible":True,"db_column":"exp_range",       "options":["0-1 yr","1-3 yrs","3-5 yrs","5-8 yrs","8-12 yrs","12-15 yrs","15+ yrs"],"placeholder":""},
                    {"id":"current_company", "label":"Current Company",     "type":"text",  "required":False,"visible":True,"db_column":"current_company", "options":[],"placeholder":""},
                    {"id":"skills",          "label":"Skills",              "type":"text",  "required":False,"visible":True,"db_column":"skills",          "options":[],"placeholder":"e.g. Python, React"},
                    {"id":"naukri_active",   "label":"Naukri Profile Active","type":"select","required":False,"visible":True,"db_column":"naukri_active",  "options":["Yes","No","Not on Naukri"],"placeholder":""},
                    {"id":"immediate_joiner","label":"Immediate Joiner",    "type":"select","required":False,"visible":True,"db_column":"immediate_joiner","options":["Yes","No","Notice period"],"placeholder":""},
                    {"id":"lead_source",     "label":"Lead Source",         "type":"select","required":False,"visible":True,"db_column":"lead_source",     "options":["Naukri","LinkedIn","Referral","Direct","Other"],"placeholder":""},
                    {"id":"sourcing_date",   "label":"Sourcing Date",       "type":"date",  "required":False,"visible":True,"db_column":"sourcing_date",   "options":[],"placeholder":""},
                ],
            },
        ],
    },
    "email_fields": {
        "form_name": "email_fields",
        "label":     "Email Field Order",
        "rows": [
            {"id":"row_name",         "left_label":"Name",                          "left_field":"full_name",              "right_label":"Phone",                     "right_field":"mobile",                 "visible":True},
            {"id":"row_email",        "left_label":"Email ID",                      "left_field":"email",                  "right_label":"Alternate no",               "right_field":"alt_phone",              "visible":True},
            {"id":"row_urls",         "left_label":"Company URL",                   "left_field":"j2w_url",                "right_label":"Client Company URL",         "right_field":"client_url",             "visible":True},
            {"id":"row_resign",       "left_label":"Resignation acceptance",         "left_field":"resignation_acceptance", "right_label":"Replacement & KT",           "right_field":"replacement_kt_status",  "visible":True},
            {"id":"row_skills",       "left_label":"Skill Set",                     "left_field":"primary_skill_stack",    "right_label":"Role/Responsibilities",      "right_field":"role_responsibilities",  "visible":True},
            {"id":"row_laptop",       "left_label":"Personal Laptop",               "left_field":"personal_laptop",        "right_label":"Total experience",           "right_field":"total_exp",              "visible":True},
            {"id":"row_resloc",       "left_label":"Current Residential Location",  "left_field":"current_city",           "right_label":"Client Work Location",       "right_field":"client_work_location",   "visible":True},
            {"id":"row_workloc",      "left_label":"Current Work Location",         "left_field":"current_work_location",  "right_label":"Current Work Timings",       "right_field":"current_work_timings",   "visible":True},
            {"id":"row_notice",       "left_label":"Notice Period (on paper)",       "left_field":"notice_period_weeks",    "right_label":"Negotiable Upto",            "right_field":"notice_negotiable_upto", "visible":True},
            {"id":"row_company",      "left_label":"Current Company",               "left_field":"last_company",           "right_label":"Payroll",                    "right_field":"payroll",                "visible":True},
            {"id":"row_ctc",          "left_label":"Current CTC",                   "left_field":"current_ctc",            "right_label":"Expected CTC",               "right_field":"expected_ctc",           "visible":True},
            {"id":"row_relexp",       "left_label":"Relevant experience",           "left_field":"relevant_exp",           "right_label":"Deploying Client",           "right_field":"deploying_client",       "visible":True},
            {"id":"row_offers",       "left_label":"Offers in Hand",                "left_field":"offers_in_hand",         "right_label":"Offers Pipeline",            "right_field":"offers_pipeline",        "visible":True},
            {"id":"row_interviews",   "left_label":"Interview Pipeline",            "left_field":"interview_pipeline",     "right_label":"Reason for change",          "right_field":"reason_for_change",      "visible":True},
            {"id":"row_dob",          "left_label":"DOB",                           "left_field":"dob",                    "right_label":"Telephonic availability",    "right_field":"telephonic_availability", "visible":True},
            {"id":"row_ide",          "left_label":"IDE Installed",                 "left_field":"ide_installed",          "right_label":"Wifi / Mobile Data",         "right_field":"wifi_connectivity",      "visible":True},
            {"id":"row_marital",      "left_label":"Marital Status",                "left_field":"marital_status",         "right_label":"LinkedIn",                   "right_field":"linkedin_url",           "visible":True},
            {"id":"row_health",       "left_label":"Health Issues (self/family)",   "left_field":"health_issues",          "right_label":"Planned Leaves (3 mo)",      "right_field":"planned_leaves",         "visible":True},
            {"id":"row_interview_av", "left_label":"Interview Avail (next 2 days)", "left_field":"interview_availability_2d","right_label":"Travel Plans",             "right_field":"upcoming_travel",        "visible":True},
        ],
    },
}


def _ensure_table(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS form_templates (
            id          SERIAL PRIMARY KEY,
            form_name   VARCHAR(80) UNIQUE NOT NULL,
            label       VARCHAR(120),
            config      TEXT NOT NULL,
            updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_by  VARCHAR(120)
        )
    """))
    db.commit()


def _seed_defaults(db: Session):
    for name, tpl in _DEFAULTS.items():
        existing = db.execute(
            text("SELECT id FROM form_templates WHERE form_name = :n"),
            {"n": name},
        ).first()
        if not existing:
            db.execute(
                text("INSERT INTO form_templates (form_name, label, config) VALUES (:n, :l, :c)"),
                {"n": name, "l": tpl["label"], "c": json.dumps(tpl)},
            )
    db.commit()


def init_form_templates():
    db = SessionLocal()
    try:
        _ensure_table(db)
        _seed_defaults(db)
    finally:
        db.close()


# ── API ───────────────────────────────────────────────────────────────────────

class TemplateSave(BaseModel):
    label: str
    sections: list | None = None
    rows: list | None = None    # used by email_fields template


@router.get("")
def list_templates(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.execute(text(
        "SELECT form_name, label, updated_at, updated_by FROM form_templates ORDER BY form_name"
    )).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{form_name}")
def get_template(form_name: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.execute(
        text("SELECT config FROM form_templates WHERE form_name = :n"),
        {"n": form_name},
    ).first()
    if not row:
        raise HTTPException(404, detail="Form template not found")
    return json.loads(row[0])


@router.put("/{form_name}")
def save_template(
    form_name: str,
    body: TemplateSave,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin")),
):
    row = db.execute(
        text("SELECT id FROM form_templates WHERE form_name = :n"),
        {"n": form_name},
    ).first()
    if not row:
        raise HTTPException(404, detail="Form template not found")

    config: dict = {"form_name": form_name, "label": body.label}
    if body.rows is not None:
        config["rows"] = body.rows
    else:
        config["sections"] = body.sections or []
    db.execute(
        text("""
            UPDATE form_templates
            SET config = :c, label = :l,
                updated_at = NOW(), updated_by = :u
            WHERE form_name = :n
        """),
        {"c": json.dumps(config), "l": body.label, "u": current_user.name, "n": form_name},
    )
    db.commit()
    return config


@router.post("/{form_name}/reset")
def reset_template(
    form_name: str,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    if form_name not in _DEFAULTS:
        raise HTTPException(404, detail="No default found for this form")
    tpl = _DEFAULTS[form_name]
    db.execute(
        text("UPDATE form_templates SET config = :c, label = :l, updated_at = NOW() WHERE form_name = :n"),
        {"c": json.dumps(tpl), "l": tpl["label"], "n": form_name},
    )
    db.commit()
    return tpl
