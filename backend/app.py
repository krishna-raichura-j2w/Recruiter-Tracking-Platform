from dotenv import load_dotenv
load_dotenv()

import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from core.config import settings
from core.database import create_tables, SessionLocal
from core.security import hash_password
from infra.models import User, UserRole, Job, JobStatus, WorkMode, PodMembership
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
from features.form_config.routes import router as form_config_router, init_form_templates
from features.probing.routes import router as probing_router
from features.boolean_builder.routes import router as boolean_builder_router
from features.coo.routes import router as coo_router

from contextlib import asynccontextmanager
from features.tasks import scheduler as task_scheduler

def ensure_schema():
    """Always-on DDL: create tables/columns that must exist before any request is served.
    Uses IF NOT EXISTS / IF NOT EXISTS so it is safe to run on every startup, even with
    multiple instances and regardless of RUN_STARTUP_BOOTSTRAP."""
    from sqlalchemy import text
    from core.database import engine, SessionLocal as _SL

    # Let SQLAlchemy create ALL ORM-defined tables (no-ops for existing ones).
    # try/except: users.id is UUID in Supabase but Integer in ORM — causes FK
    # type mismatch on pod_memberships. All tables are managed via SQL migrations.
    from core.database import Base
    from infra import models as _m        # noqa: F401 — registers all models
    from infra import hrbp_models as _hm  # noqa: F401 — registers HRBP models
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as _cae:
        print(f"[ensure_schema] create_all skipped (use SQL migrations): {_cae}")

    # Belt-and-suspenders: also create via raw DDL (catches edge-cases where
    # create_all silently skips due to partial metadata load)
    db = _SL()
    try:
        stmts = [
            """CREATE TABLE IF NOT EXISTS pod_memberships (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                pod_lead_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT uq_pod_membership UNIQUE (user_id, pod_lead_id)
            )""",
            "CREATE INDEX IF NOT EXISTS ix_pod_memberships_user_id     ON pod_memberships(user_id)",
            "CREATE INDEX IF NOT EXISTS ix_pod_memberships_pod_lead_id ON pod_memberships(pod_lead_id)",
            # ── Probing sheet ────────────────────────────────────────────────
            """CREATE TABLE IF NOT EXISTS probing_data (
                id                          SERIAL PRIMARY KEY,
                job_id                      INTEGER,
                reporting_manager_location  TEXT,
                onsite_opportunities        TEXT,
                project_size                TEXT,
                project_count               TEXT,
                work_mode                   TEXT,
                candidate_role              TEXT,
                feedback_eta                TEXT,
                work_location               TEXT,
                interview_type              TEXT,
                role_clarity                TEXT,
                notice_period               TEXT,
                interview_rounds_count      TEXT,
                urgency_eta                 TEXT,
                skill_type                  TEXT,
                created_by_id               INTEGER REFERENCES users(id),
                created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )""",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_id INTEGER",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS probing_id INTEGER REFERENCES probing_data(id)",
            # If a prior deploy created job_id as VARCHAR, convert to INTEGER (idempotent)
            "ALTER TABLE jobs         ALTER COLUMN job_id TYPE INTEGER USING NULLIF(job_id::text, '')::INTEGER",
            "ALTER TABLE probing_data ALTER COLUMN job_id TYPE INTEGER USING NULLIF(job_id::text, '')::INTEGER",
            # Creator email snapshot
            "ALTER TABLE jobs         ADD COLUMN IF NOT EXISTS email_id VARCHAR(200)",
            "ALTER TABLE probing_data ADD COLUMN IF NOT EXISTS email_id VARCHAR(200)",
            # Multi-DL support: JSON array of delivery lead IDs
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS delivery_lead_ids TEXT DEFAULT '[]'",
            # Allow 'coo' value in users.role CHECK constraint (SAEnum native_enum=False)
            "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check",
            "ALTER TABLE users DROP CONSTRAINT IF EXISTS userrole",
            "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'kam', 'recruiter', 'delivery_lead', 'coo'))",
            # ── candidates: external-system / polymorphic-user columns ─────
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS first_name       VARCHAR(100)",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_name        VARCHAR(100)",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location         VARCHAR(200)",
            # Migrate legacy integer location_id → string location, then drop the old column
            "UPDATE candidates SET location = location_id::text WHERE location IS NULL AND location_id IS NOT NULL",
            "ALTER TABLE candidates DROP COLUMN IF EXISTS location_id",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS contact_phone    VARCHAR(30)",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS gender           VARCHAR(20)",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS designation      VARCHAR(200)",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS employer         VARCHAR(200)",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS total_experience DOUBLE PRECISION",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS min_experience   DOUBLE PRECISION",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS max_experience   DOUBLE PRECISION",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS current_ctc      DOUBLE PRECISION",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS expected_ctc     DOUBLE PRECISION",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume           TEXT",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS role_id          INTEGER     NOT NULL DEFAULT 4",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS type             VARCHAR(50) NOT NULL DEFAULT 'UserCandidate'",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS created_by       VARCHAR(200)",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS dl_verified      BOOLEAN NOT NULL DEFAULT FALSE",
            # Backfill defaults for any rows the DEFAULT didn't catch (e.g. column pre-existed without default)
            "UPDATE candidates SET role_id = 4              WHERE role_id IS NULL",
            "UPDATE candidates SET type    = 'UserCandidate' WHERE type    IS NULL",
            # Backfill created_by with the sourcer's email so historical rows attribute correctly
            "UPDATE candidates SET created_by = u.email FROM users u WHERE candidates.created_by IS NULL AND candidates.sourced_by_id = u.id",
            # Backfill dl_verified from existing validations so historical rows reflect the same flag
            "UPDATE candidates SET dl_verified = TRUE FROM validations v WHERE v.candidate_id = candidates.id AND v.status = 'validated' AND candidates.dl_verified IS DISTINCT FROM TRUE",
        ]
        for sql in stmts:
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        # Backfill existing pod_lead_id values into pod_memberships
        try:
            rows = db.execute(text("SELECT id, pod_lead_id FROM users WHERE pod_lead_id IS NOT NULL")).fetchall()
            for row in rows:
                db.execute(
                    text("""INSERT INTO pod_memberships (user_id, pod_lead_id)
                            VALUES (:uid, :plid)
                            ON CONFLICT (user_id, pod_lead_id) DO NOTHING"""),
                    {"uid": row.id, "plid": row.pod_lead_id},
                )
            if rows:
                db.commit()
        except Exception as _e:
            db.rollback()
            print(f"[ensure_schema] pod_memberships backfill: {_e}")

        # Seed COO user Priya Mohan (idempotent)
        try:
            from core.security import hash_password
            db.execute(
                text("""INSERT INTO users (name, email, password_hash, role, is_active, must_change_password)
                        VALUES (:name, :email, :ph, 'coo', true, false)
                        ON CONFLICT (email) DO NOTHING"""),
                {
                    "name": "Priya Mohan",
                    "email": "priya.mohan@joulestowatts.com",
                    "ph": hash_password("joules@123"),
                },
            )
            db.commit()
        except Exception as _e:
            db.rollback()
            print(f"[ensure_schema] coo seed: {_e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app_):
    # Always ensure critical schema additions exist (idempotent, safe for multi-instance).
    ensure_schema()
    # Always seed missing form templates (only inserts rows that don't exist).
    try:
        init_form_templates()
    except Exception as e:
        print(f"[lifespan] init_form_templates: {e}")

    # Full bootstrap (seed data, all migrations) — only when explicitly enabled.
    if settings.run_startup_bootstrap:
        create_tables()
        db = SessionLocal()
        try:
            run_migrations(db)
            seed_data(db)
        finally:
            db.close()
    print("J2W Tracker API is running")

    if settings.start_scheduler_on_startup:
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
app.include_router(form_config_router,      prefix="/api")
app.include_router(probing_router,          prefix="/api")
app.include_router(boolean_builder_router,  prefix="/api")
app.include_router(coo_router,              prefix="/api")


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
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_job_id VARCHAR(100)")
    # Ensure of_clients has a client_id column with UNIQUE so jobs.client_id can FK to it.
    _run("ALTER TABLE of_clients ADD COLUMN IF NOT EXISTS client_id INTEGER")
    _run("ALTER TABLE of_clients ADD CONSTRAINT of_clients_client_id_key UNIQUE (client_id)")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES of_clients(client_id)")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS demand_source VARCHAR(80)")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS demand_type VARCHAR(50)")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS demand_exclusivity VARCHAR(50)")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sourcing_target INTEGER")
    _run("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS kam_id INTEGER REFERENCES users(id)")
    _run("ALTER TABLE users ADD COLUMN IF NOT EXISTS secondary_role VARCHAR(30)")
    _run("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE")
    _run("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER REFERENCES users(id),
            action      VARCHAR(100),
            entity_type VARCHAR(100),
            entity_id   INTEGER,
            detail      TEXT,
            created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _run("CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id)")
    _run("CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs(created_at DESC)")

    # pod_memberships table + backfill is handled by ensure_schema() which runs
    # unconditionally at startup — no need to repeat it here.

    # ── Merge sourcer_ids + caller_ids → unified recruiter list ──────────────
    # Old data had separate sourcer/caller people; unify them so nothing breaks.
    try:
        import json as _json
        rows = db.execute(text("SELECT id, sourcer_ids, caller_ids FROM jobs")).fetchall()
        for row in rows:
            s = _json.loads(row.sourcer_ids or '[]') if isinstance(row.sourcer_ids, str) else (row.sourcer_ids or [])
            c = _json.loads(row.caller_ids  or '[]') if isinstance(row.caller_ids,  str) else (row.caller_ids  or [])
            merged = list(dict.fromkeys(s + c))   # union, preserve order, deduplicate
            if merged != s or merged != c:
                db.execute(
                    text("UPDATE jobs SET sourcer_ids = :s, caller_ids = :c WHERE id = :id"),
                    {"s": _json.dumps(merged), "c": _json.dumps(merged), "id": row.id},
                )
        db.commit()
    except Exception as _e:
        db.rollback()
        print(f"[migration] merge sourcer/caller: {_e}")


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
    members_created = []
    for name, email, pwd, urole in team_members:
        u = User(name=name, email=email, password_hash=hash_password(pwd),
                 role=urole, pod_lead_id=dl.id)
        db.add(u)
        members_created.append(u)

    db.flush()

    # Populate pod_memberships for seed data
    for u in members_created:
        db.add(PodMembership(user_id=u.id, pod_lead_id=dl.id))

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
