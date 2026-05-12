from dotenv import load_dotenv
load_dotenv()

import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
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
from features.clients.routes import router as clients_router
from features.account_managers.routes import router as business_heads_router
from features.export.routes import router as export_router
from features.followup.routes import router as followup_router
from features.notifications.routes import router as notifications_router
from features.demand_status.routes import router as demand_status_router
from features.upload.routes import router as upload_router

from contextlib import asynccontextmanager
from features.tasks import scheduler as task_scheduler

@asynccontextmanager
async def lifespan(app_):
    task_scheduler.start()
    yield
    task_scheduler.stop()

app = FastAPI(title="J2W Recruiter Tracking", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
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
app.include_router(clients_router,           prefix="/api")
app.include_router(business_heads_router,   prefix="/api")
app.include_router(export_router,           prefix="/api")
app.include_router(followup_router,         prefix="/api")
app.include_router(notifications_router,    prefix="/api")
app.include_router(demand_status_router,    prefix="/api")
app.include_router(upload_router,           prefix="/api")


def run_migrations(db):
    """Run all DDL migrations. Each statement is committed individually so that
    concurrent startup workers don't deadlock each other on ALTER TABLE locks."""
    from sqlalchemy import text

    def _run(sql: str, params: dict | None = None):
        try:
            db.execute(text(sql), params or {})
            db.commit()
        except Exception:
            db.rollback()   # column/table already exists — safe to ignore

    # ── Data migrations (DML) ────────────────────────────────────────────────
    try:
        new_hash = hash_password("rec123")
        result = db.execute(
            text("UPDATE users SET role='recruiter', password_hash=:h WHERE role IN ('caller','sourcing_partner')"),
            {"h": new_hash},
        )
        if result.rowcount:
            print(f"Migrated {result.rowcount} users → recruiter")
        db.execute(text("UPDATE users SET role='kam' WHERE role='pod_lead'"))
        db.commit()
    except Exception:
        db.rollback()

    # ── DDL: one commit per statement ────────────────────────────────────────
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_caller_id INTEGER REFERENCES users(id)")
    _run("ALTER TABLE users ADD COLUMN IF NOT EXISTS recruiter_type VARCHAR(20)")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcer_ids TEXT DEFAULT '[]'")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS caller_ids TEXT DEFAULT '[]'")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_raw_text TEXT")
    _run("""
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
    """)
    _run("""CREATE TABLE IF NOT EXISTS consultant_mails (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER UNIQUE NOT NULL REFERENCES candidates(id),
        sent_by_id INTEGER REFERENCES users(id),
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        exit_date VARCHAR(20),
        acknowledgement_received BOOLEAN DEFAULT FALSE,
        acknowledgement_at TIMESTAMP WITH TIME ZONE,
        dl_verified BOOLEAN DEFAULT FALSE,
        dl_verified_at TIMESTAMP WITH TIME ZONE
    )""")
    _run("""CREATE TABLE IF NOT EXISTS account_managers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(200),
        phone VARCHAR(30),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )""")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS account_manager_id INTEGER REFERENCES account_managers(id)")
    _run("""CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) UNIQUE NOT NULL,
        short_name VARCHAR(80),
        website_url VARCHAR(300),
        logo_data TEXT,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_updated_by VARCHAR(120)
    )""")
    _run("ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()")
    _run("ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_updated_by VARCHAR(120)")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITH TIME ZONE")
    _run("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rejection_reason TEXT")
    _run("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(200)")
    _run("ALTER TABLE consultant_mails ADD COLUMN IF NOT EXISTS exit_proof TEXT")
    _run("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_data TEXT")
    _run("ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcing_deadline TIMESTAMP WITH TIME ZONE")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calling_deadline TIMESTAMP WITH TIME ZONE")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcing_warned BOOLEAN DEFAULT FALSE")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcing_alerted BOOLEAN DEFAULT FALSE")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calling_warned BOOLEAN DEFAULT FALSE")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calling_alerted BOOLEAN DEFAULT FALSE")


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


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "J2W Recruiter Tracking API"}


# Serve frontend build (SPA) if present. FRONTEND_DIST can override the path.
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", "/app/frontend_dist"))
if FRONTEND_DIST.is_dir():
    @app.get("/")
    def _spa_root():
        return FileResponse(FRONTEND_DIST / "index.html")

    if (FRONTEND_DIST / "assets").is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=FRONTEND_DIST / "assets"),
            name="assets",
        )

    @app.get("/{full_path:path}")
    def _spa_catch_all(full_path: str):
        # Any non-/api path: serve the file if it exists in dist, else index.html (SPA route).
        if full_path.startswith("api/") or full_path == "api":
            raise StarletteHTTPException(status_code=404)
        candidate = (FRONTEND_DIST / full_path).resolve()
        try:
            candidate.relative_to(FRONTEND_DIST.resolve())
        except ValueError:
            raise StarletteHTTPException(status_code=404)
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    def _root():
        return {"status": "ok", "service": "J2W Recruiter Tracking API"}
