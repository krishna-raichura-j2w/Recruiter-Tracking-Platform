from dotenv import load_dotenv

load_dotenv()

import os  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402
from pathlib import Path  # noqa: E402

from core.config import settings  # noqa: E402
from core.database import SessionLocal, create_tables  # noqa: E402
from core.security import hash_password  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from features.hrbp.router import hrbp_router  # noqa: E402
from features.mrr.account_managers.routes import (  # noqa: E402
    router as business_heads_router,
)

# Remove KAM imports (role no longer exists)
from features.mrr.auth.routes import router as auth_router  # noqa: E402
from features.mrr.boolean_builder.routes import (  # noqa: E402
    router as boolean_builder_router,
)
from features.mrr.calls.routes import router as calls_router  # noqa: E402
from features.mrr.candidates.routes import router as candidates_router  # noqa: E402
from features.mrr.clients.routes import router as clients_router  # noqa: E402
from features.mrr.coo.routes import router as coo_router  # noqa: E402
from features.mrr.dashboard.routes import router as dashboard_router  # noqa: E402
from features.mrr.demand_status.routes import (  # noqa: E402
    router as demand_status_router,
)
from features.mrr.export.routes import router as export_router  # noqa: E402
from features.mrr.followup.routes import router as followup_router  # noqa: E402
from features.mrr.form_config.routes import (  # noqa: E402
    init_form_templates,
)
from features.mrr.form_config.routes import (  # noqa: E402
    router as form_config_router,
)
from features.mrr.jd_extract.routes import router as jd_extract_router  # noqa: E402
from features.mrr.jobs.routes import router as jobs_router  # noqa: E402
from features.mrr.mails.routes import router as mails_router  # noqa: E402
from features.mrr.notifications.routes import (  # noqa: E402
    router as notifications_router,
)
from features.mrr.pods.routes import router as pods_router  # noqa: E402
from features.mrr.probing.routes import router as probing_router  # noqa: E402
from features.mrr.resume_extract.routes import (  # noqa: E402
    router as resume_extract_router,
)
from features.mrr.submissions.routes import router as submissions_router  # noqa: E402
from features.mrr.targets.routes import router as targets_router  # noqa: E402
from features.mrr.tasks import scheduler as task_scheduler  # noqa: E402
from features.mrr.upload.routes import router as upload_router  # noqa: E402
from features.mrr.users.routes import router as users_router  # noqa: E402
from features.mrr.validation.consultant_profile_routes import (  # noqa: E402
    router as consultant_profile_router,
)
from features.mrr.validation.routes import router as validation_router  # noqa: E402
from infra.models import (  # noqa: E402
    Job,
    JobStatus,
    PodMembership,
    User,
    UserRole,
    WorkMode,
)
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402


def ensure_schema():
    """
    Always-on DDL: create tables/columns that must exist before any request is served.
    Uses IF NOT EXISTS / IF NOT EXISTS so it is safe to run on every startup, even with
    multiple instances and regardless of RUN_STARTUP_BOOTSTRAP.
    """
    # Let SQLAlchemy create ALL ORM-defined tables (no-ops for existing ones).
    # try/except: users.id is UUID in Supabase but Integer in ORM — causes FK
    # type mismatch on pod_memberships. All tables are managed via SQL migrations.
    from core.database import Base, engine
    from core.database import SessionLocal as _SL
    from core.sql_loader import load_sql, load_sql_list
    from infra import hrbp_models as _hm  # noqa: F401 — registers HRBP models
    from infra import models as _m  # noqa: F401 — registers all models
    from sqlalchemy import text

    try:
        Base.metadata.create_all(bind=engine)
    except Exception as _cae:
        print(f"[ensure_schema] create_all skipped (use SQL migrations): {_cae}")

    # Belt-and-suspenders: also create via raw DDL (catches edge-cases where
    # create_all silently skips due to partial metadata load)
    db = _SL()
    try:
        for sql in load_sql_list("030-ensure_schema_ddl.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        # Migrate legacy account_managers (Business Heads) into users with role='bh'.
        # Old design: account_managers was a standalone table referenced by jobs.account_manager_id.
        # New design: BHs are Users with role='bh' so they can log in and be placed in a pod.
        # Steps: (1) insert a user row for each AM by email; (2) re-point jobs.account_manager_id
        # at the new user.id; (3) drop the FK on jobs.account_manager_id so it can reference users.
        try:
            from core.security import hash_password

            ams = db.execute(
                text(load_sql("012-fetch_account_managers_for_migration.sql")),
            ).fetchall()
            for am in ams:
                db.execute(
                    text(load_sql("013-migrate_account_managers_to_users.sql")),
                    {
                        "name": am.name,
                        "email": am.email,
                        "ph": hash_password("joules@123"),
                    },
                )
            db.commit()
            db.execute(text(load_sql("014-drop_jobs_account_manager_fkey.sql")))
            db.commit()
            db.execute(text(load_sql("015-remap_jobs_to_user_account_managers.sql")))
            db.commit()
        except Exception as _e:
            db.rollback()
            print(f"[ensure_schema] BH→user migration: {_e}")

        # Backfill existing pod_lead_id values into pod_memberships
        try:
            rows = db.execute(
                text(load_sql("016-fetch_users_with_pod_lead.sql")),
            ).fetchall()
            for row in rows:
                db.execute(
                    text(load_sql("017-backfill_pod_memberships.sql")),
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
                text(load_sql("018-seed_coo_user.sql")),
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

app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(candidates_router, prefix="/api")
app.include_router(calls_router, prefix="/api")
app.include_router(validation_router, prefix="/api")
app.include_router(consultant_profile_router, prefix="/api")
app.include_router(submissions_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(resume_extract_router, prefix="/api")
app.include_router(jd_extract_router, prefix="/api")
app.include_router(mails_router, prefix="/api")
app.include_router(clients_router, prefix="/api")
app.include_router(business_heads_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(followup_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(demand_status_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(form_config_router, prefix="/api")
app.include_router(probing_router, prefix="/api")
app.include_router(boolean_builder_router, prefix="/api")
app.include_router(coo_router, prefix="/api")
app.include_router(pods_router, prefix="/api")
app.include_router(targets_router, prefix="/api")
app.include_router(hrbp_router, prefix="/api")


def run_migrations(db):
    """
    Run all DDL migrations. Each statement is committed individually so that
    concurrent startup workers don't deadlock each other on ALTER TABLE locks.
    """
    from core.sql_loader import load_sql, load_sql_list
    from sqlalchemy import text

    def _run(sql: str, params: dict | None = None):
        try:
            db.execute(text(sql), params or {})
            db.commit()
        except Exception:
            db.rollback()  # column/table already exists — safe to ignore

    # ── Data migrations (DML) ────────────────────────────────────────────────
    try:
        new_hash = hash_password("rec123")
        result = db.execute(
            text(load_sql("019-migrate_recruiter_roles.sql")),
            {"h": new_hash},
        )
        if result.rowcount:
            print(f"Migrated {result.rowcount} users → recruiter")
        db.execute(text(load_sql("020-migrate_pod_lead_to_kam.sql")))
        db.commit()
    except Exception:
        db.rollback()

    # ── DDL: one commit per statement ────────────────────────────────────────
    for stmt in load_sql_list("031-run_migrations_ddl.sql"):
        _run(stmt)

    # pod_memberships table + backfill is handled by ensure_schema() which runs
    # unconditionally at startup — no need to repeat it here.

    # ── Merge sourcer_ids + caller_ids → unified recruiter list ──────────────
    # Old data had separate sourcer/caller people; unify them so nothing breaks.
    try:
        import json as _json

        rows = db.execute(
            text(load_sql("021-fetch_jobs_recruiter_lists.sql")),
        ).fetchall()
        for row in rows:
            s = (
                _json.loads(row.sourcer_ids or "[]")
                if isinstance(row.sourcer_ids, str)
                else (row.sourcer_ids or [])
            )
            c = (
                _json.loads(row.caller_ids or "[]")
                if isinstance(row.caller_ids, str)
                else (row.caller_ids or [])
            )
            merged = list(dict.fromkeys(s + c))  # union, preserve order, deduplicate
            if merged != s or merged != c:
                db.execute(
                    text(load_sql("022-update_jobs_recruiter_lists.sql")),
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
    admin_user = User(
        name="Admin User",
        email="admin@j2w.com",
        password_hash=hash_password("admin123"),
        role=UserRole.admin,
    )
    # Pod Lead — ONLY uploads JDs
    priya = User(
        name="Priya Sharma",
        email="priya@j2w.com",
        password_hash=hash_password("kam123"),
        role=UserRole.kam,
    )
    # Delivery Lead — manages team + reviews JDs + handles validation/submissions
    dl = User(
        name="Delivery Lead",
        email="dl@j2w.com",
        password_hash=hash_password("dl123"),
        role=UserRole.delivery_lead,
    )
    db.add_all([admin_user, priya, dl])
    db.flush()  # get IDs

    # Team members assigned to the Delivery Lead (pod_lead_id → DL's id)
    team_members = [
        ("Shwetha R", "shwetha@j2w.com", "rec123", UserRole.recruiter),
        ("Gagana M", "gagana@j2w.com", "rec123", UserRole.recruiter),
        ("Nithish S", "nithish@j2w.com", "rec123", UserRole.recruiter),
        ("Subhashree P", "subhashree@j2w.com", "rec123", UserRole.recruiter),
        ("Prathik K", "prathik@j2w.com", "rec123", UserRole.recruiter),
        ("Ravi Kumar", "ravi@j2w.com", "rec123", UserRole.recruiter),
        ("Rakshith B", "rakshith@j2w.com", "rec123", UserRole.recruiter),
    ]
    members_created = []
    for name, email, pwd, urole in team_members:
        u = User(
            name=name,
            email=email,
            password_hash=hash_password(pwd),
            role=urole,
            pod_lead_id=dl.id,
        )
        db.add(u)
        members_created.append(u)

    db.flush()

    # Populate pod_memberships for seed data
    for u in members_created:
        db.add(PodMembership(user_id=u.id, pod_lead_id=dl.id))

    # ── Jobs (created by Pod Lead, pending DL review) ─────────────────────
    jobs_data = [
        ("GEHC", "Data Engineer", "Python, Spark, SQL", WorkMode.hybrid_2),
        (
            "JLL",
            "Full Stack Developer",
            "React, Node.js, PostgreSQL",
            WorkMode.hybrid_3,
        ),
        ("Analog", "Embedded Systems Engineer", "C, RTOS, ARM", WorkMode.onsite),
        ("Sony", "ML Engineer", "Python, TensorFlow, MLflow", WorkMode.remote),
        (
            "Flipkart",
            "Backend Engineer",
            "Java, Kafka, Microservices",
            WorkMode.hybrid_2,
        ),
    ]
    for client, jrole, skills, mode in jobs_data:
        db.add(
            Job(
                client_name=client,
                role_title=jrole,
                skill_stack=skills,
                work_mode=mode,
                headcount=3,
                status=JobStatus.pending_review,  # awaiting DL confirmation
                created_by_id=priya.id,
            ),
        )

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
