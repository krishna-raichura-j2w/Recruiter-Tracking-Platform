from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.database import create_tables, SessionLocal
from core.security import hash_password
from infra.models import User, UserRole, Job, JobStatus, WorkMode
# Remove KAM imports (role no longer exists)

from features.auth.routes import router as auth_router
from features.users.routes import router as users_router
from features.jobs.routes import router as jobs_router
from features.candidates.routes import router as candidates_router
from features.calls.routes import router as calls_router
from features.validation.routes import router as validation_router
from features.validation.consultant_profile_routes import router as consultant_profile_router
from features.submissions.routes import router as submissions_router
from features.dashboard.routes import router as dashboard_router
from features.resume_extract.routes import router as resume_extract_router
from features.jd_extract.routes import router as jd_extract_router
from features.mails.routes import router as mails_router

app = FastAPI(title="J2W Recruiter Tracking", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,               prefix="/api")
app.include_router(users_router,              prefix="/api")
app.include_router(jobs_router,               prefix="/api")
app.include_router(candidates_router,         prefix="/api")
app.include_router(calls_router,              prefix="/api")
app.include_router(validation_router,         prefix="/api")
app.include_router(consultant_profile_router, prefix="/api")
app.include_router(submissions_router,        prefix="/api")
app.include_router(dashboard_router,          prefix="/api")
app.include_router(resume_extract_router,     prefix="/api")
app.include_router(jd_extract_router,        prefix="/api")
app.include_router(mails_router,             prefix="/api")


def run_migrations(db):
    from sqlalchemy import text
    # Migrate old roles → recruiter
    new_hash = hash_password("rec123")
    result = db.execute(
        text("UPDATE users SET role = 'recruiter', password_hash = :h WHERE role IN ('caller', 'sourcing_partner')"),
        {"h": new_hash},
    )
    if result.rowcount:
        db.commit()
        print(f"Migrated {result.rowcount} users → recruiter (password: rec123)")
    # Add assigned_caller_id column to jobs if not present
    db.execute(text(
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_caller_id INTEGER REFERENCES users(id)"
    ))
    # Add recruiter_type column to users if not present
    db.execute(text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS recruiter_type VARCHAR(20)"
    ))
    db.execute(text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcer_ids TEXT DEFAULT '[]'"))
    db.execute(text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS caller_ids TEXT DEFAULT '[]'"))
    db.execute(text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_raw_text TEXT"))
    # Rename pod_lead → kam
    db.execute(text("UPDATE users SET role = 'kam' WHERE role = 'pod_lead'"))
    # Add submission_timeline table
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS submission_timeline (
            id             SERIAL PRIMARY KEY,
            submission_id  INTEGER NOT NULL REFERENCES submissions(id),
            stage          VARCHAR(60) NOT NULL,
            stage_label    VARCHAR(120),
            interview_date VARCHAR(30),
            feedback       VARCHAR(30),
            note           TEXT,
            updated_by_id  INTEGER REFERENCES users(id),
            created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """))
    db.execute(text("""CREATE TABLE IF NOT EXISTS consultant_mails (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER UNIQUE NOT NULL REFERENCES candidates(id),
        sent_by_id INTEGER REFERENCES users(id),
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        exit_date VARCHAR(20),
        acknowledgement_received BOOLEAN DEFAULT FALSE,
        acknowledgement_at TIMESTAMP WITH TIME ZONE,
        dl_verified BOOLEAN DEFAULT FALSE,
        dl_verified_at TIMESTAMP WITH TIME ZONE
    )"""))
    db.commit()


def seed_data(db):
    # Check by admin email so DL insertion in run_migrations() doesn't block seeding
    if db.query(User).filter(User.email == "admin@j2w.com").first():
        return

    # ── Users ────────────────────────────────────────────────────────────────
    # Admin
    admin_user = User(name="Admin User", email="admin@j2w.com",
                      password_hash=hash_password("admin123"), role=UserRole.admin)
    # Pod Lead — ONLY uploads JDs
    priya = User(name="Priya Sharma", email="priya@j2w.com",
                 password_hash=hash_password("kam123"), role=UserRole.kam)
    # Delivery Lead — manages team + reviews JDs + handles validation/submissions
    dl = User(name="Delivery Lead",  email="dl@j2w.com",
              password_hash=hash_password("dl123"), role=UserRole.delivery_lead)
    db.add_all([admin_user, priya, dl])
    db.flush()  # get IDs

    # Team members assigned to the Delivery Lead (pod_lead_id → DL's id)
    team_members = [
        ("Shwetha R",    "shwetha@j2w.com",    "rec123", UserRole.recruiter),
        ("Gagana M",     "gagana@j2w.com",      "rec123", UserRole.recruiter),
        ("Nithish S",    "nithish@j2w.com",     "rec123", UserRole.recruiter),
        ("Subhashree P", "subhashree@j2w.com",  "rec123", UserRole.recruiter),
        ("Prathik K",    "prathik@j2w.com",     "rec123", UserRole.recruiter),
        ("Ravi Kumar",   "ravi@j2w.com",        "rec123", UserRole.recruiter),
        ("Rakshith B",   "rakshith@j2w.com",    "rec123", UserRole.recruiter),
    ]
    for name, email, pwd, urole in team_members:
        db.add(User(name=name, email=email, password_hash=hash_password(pwd),
                    role=urole, pod_lead_id=dl.id))

    db.flush()

    # ── Jobs (created by Pod Lead, pending DL review) ─────────────────────
    jobs_data = [
        ("GEHC",    "Data Engineer",              "Python, Spark, SQL",         WorkMode.hybrid_2),
        ("JLL",     "Full Stack Developer",        "React, Node.js, PostgreSQL", WorkMode.hybrid_3),
        ("Analog",  "Embedded Systems Engineer",   "C, RTOS, ARM",               WorkMode.onsite),
        ("Sony",    "ML Engineer",                 "Python, TensorFlow, MLflow", WorkMode.remote),
        ("Flipkart","Backend Engineer",            "Java, Kafka, Microservices", WorkMode.hybrid_2),
    ]
    for client, jrole, skills, mode in jobs_data:
        db.add(Job(
            client_name=client,
            role_title=jrole,
            skill_stack=skills,
            work_mode=mode,
            headcount=3,
            status=JobStatus.pending_review,   # awaiting DL confirmation
            created_by_id=priya.id,
        ))

    db.commit()
    print("Seed data created")


@app.on_event("startup")
def on_startup():
    create_tables()
    db = SessionLocal()
    try:
        run_migrations(db)
        seed_data(db)
    finally:
        db.close()
    print("J2W Tracker API is running")


@app.get("/")
def health():
    return {"status": "ok", "service": "J2W Recruiter Tracking API"}
