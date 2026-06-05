from dotenv import load_dotenv

load_dotenv()

import os  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402
from pathlib import Path  # noqa: E402

from core.config import settings  # noqa: E402
from core.sql_loader import load_sql, load_sql_list  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from features.hrbp.router import hrbp_router  # noqa: E402
from features.mrr.account_managers.routes import (  # noqa: E402
    router as business_heads_router,
)
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
from features.mrr.form_config.routes import init_form_templates  # noqa: E402
from features.mrr.form_config.routes import router as form_config_router  # noqa: E402
from features.mrr.jd_extract.routes import router as jd_extract_router  # noqa: E402
from features.mrr.jobs.routes import router as jobs_router  # noqa: E402
from features.mrr.drives.routes import router as drives_router  # noqa: E402
from features.mrr.mails.routes import router as mails_router  # noqa: E402
from features.mrr.notifications.routes import (  # noqa: E402
    router as notifications_router,
)
from features.mrr.client_emails.routes import router as client_emails_router  # noqa: E402
from features.mrr.ol_lookup.routes import router as ol_lookup_router  # noqa: E402
from features.mrr.leaves.routes import router as leaves_router  # noqa: E402
from features.mrr.pods.routes import router as pods_router  # noqa: E402
from features.mrr.probing.routes import router as probing_router  # noqa: E402
from features.mrr.resume_extract.routes import (  # noqa: E402
    router as resume_extract_router,
)
from features.mrr.submissions.routes import router as submissions_router  # noqa: E402
from features.mrr.targets.routes import router as targets_router  # noqa: E402
from features.mrr.pod_plan.routes import router as pod_plan_router  # noqa: E402
from features.mrr.tasks import scheduler as task_scheduler  # noqa: E402
from features.hrbp.tasks import scheduler as hrbp_scheduler  # noqa: E402
from features.mrr.upload.routes import router as upload_router  # noqa: E402
from features.mrr.users.routes import router as users_router  # noqa: E402
from features.mrr.validation.consultant_profile_routes import (  # noqa: E402
    router as consultant_profile_router,
)
from features.mrr.validation.routes import router as validation_router  # noqa: E402
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402


def ensure_schema():
    """Always-on DDL: idempotent schema setup that runs on every startup."""
    from core.database import Base, engine
    from core.database import SessionLocal as _SL
    from core.security import hash_password
    from infra import hrbp_models as _hm  # noqa: F401 — registers HRBP models
    from infra import models as _m  # noqa: F401 — registers all models
    from sqlalchemy import text

    try:
        Base.metadata.create_all(bind=engine)
    except Exception as _cae:
        print(f"[ensure_schema] create_all skipped (use SQL migrations): {_cae}")

    db = _SL()
    try:
        # With uvicorn --workers N, every worker runs this on startup. Gate the
        # whole migration suite behind a Postgres advisory lock so only ONE worker
        # executes DDL — the rest skip it (the schema is shared). Prevents N workers
        # from hammering ALTER TABLE simultaneously.
        got_lock = db.execute(text("SELECT pg_try_advisory_lock(917244)")).scalar()
        if not got_lock:
            print("[ensure_schema] migration lock held by another worker — skipping DDL")
            return
        # Make DDL fail fast instead of head-of-line-blocking SELECTs on a busy
        # table. A no-op `ALTER ... IF NOT EXISTS` still requests a brief
        # AccessExclusive lock; without a timeout it queues behind live SELECTs and
        # then blocks every new SELECT on that table, exhausting the pool. Bail
        # after 3s (caught + rolled back) so traffic keeps flowing.
        db.execute(text("SET lock_timeout = '3s'"))
        db.commit()

        for sql in load_sql_list("030-ensure_schema_ddl.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("031-run_migrations_ddl.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("033-add_job_ol_fields.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("036-add_questionnaire_to_jobs.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("037-add_questionnaire_notes.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("034-add_candidate_application_arrays.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("038-add_jobs_assigned_email_id.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("039-add_user_leaves.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("040-add_client_emails.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("041-add_candidate_ol_flags.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("043-bh_pod_plan.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("044-bh_recruiter_primary_subs.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("045-bh_pod_week_weights.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("046-bh_pod_custom_working_days.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("047-bh_customer_client_ids.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for sql in load_sql_list("050-add_drives.sql"):
            try:
                db.execute(text(sql))
                db.commit()
            except Exception:
                db.rollback()

        for stmt in [
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_synced BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_synced BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS collaborator_kam_ids TEXT DEFAULT '[]'",
        ]:
            try:
                db.execute(text(stmt))
                db.commit()
            except Exception:
                db.rollback()

        # Backfill jobs.assigned_email_id for legacy rows (the SQLAlchemy
        # event keeps it in sync going forward, but pre-existing rows need
        # one initial pass). Filter via array_length() IS NULL — that's how
        # PostgreSQL signals "empty array" (and matches the column's default
        # value of '{}'). Re-running this on every startup is cheap because
        # populated rows are skipped at the SQL level.
        try:
            from infra.models import Job, _job_assignee_user_ids
            empty_jobs = (
                db.query(Job)
                  .filter(text("array_length(assigned_email_id, 1) IS NULL"))
                  .all()
            )
            if empty_jobs:
                from infra.models import User as _User
                user_email_by_id = {
                    u.id: u.email for u in db.query(_User).all() if u.email
                }
                for j in empty_jobs:
                    ids = _job_assignee_user_ids(j)
                    emails = sorted({
                        e for uid in ids if (e := user_email_by_id.get(uid))
                    })
                    j.assigned_email_id = emails
                db.commit()
        except Exception as _e:
            db.rollback()
            print(f"[ensure_schema] assigned_email_id backfill: {_e}")

        # Legacy BH → user migration (idempotent)
        try:
            ams = db.execute(
                text(load_sql("012-fetch_account_managers_for_migration.sql")),
            ).fetchall()
            for am in ams:
                db.execute(
                    text(load_sql("013-migrate_account_managers_to_users.sql")),
                    {"name": am.name, "email": am.email, "ph": hash_password("joules@123")},  # noqa: S106
                )
            db.commit()
            db.execute(text(load_sql("014-drop_jobs_account_manager_fkey.sql")))
            db.commit()
            db.execute(text(load_sql("015-remap_jobs_to_user_account_managers.sql")))
            db.commit()
        except Exception as _e:
            db.rollback()
            print(f"[ensure_schema] BH migration: {_e}")

        # Backfill pod_memberships from legacy pod_lead_id (idempotent)
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

        # Ensure COO user exists (idempotent)
        try:
            db.execute(
                text(load_sql("018-seed_coo_user.sql")),
                {
                    "name": "Priya Mohan",
                    "email": "priya.mohan@joulestowatts.com",
                    "ph": hash_password("joules@123"),  # noqa: S106
                },
            )
            db.commit()
        except Exception as _e:
            db.rollback()
            print(f"[ensure_schema] coo user: {_e}")

    finally:
        # Release the advisory lock (no-op if this worker never held it).
        try:
            db.execute(text("SELECT pg_advisory_unlock(917244)"))
            db.commit()
        except Exception:
            db.rollback()
        db.close()


@asynccontextmanager
async def lifespan(app_):  # noqa: RUF029
    # Schema DDL/backfills are idempotent but only need to run when a schema change
    # ships. Skipping them in steady state avoids per-boot lock contention on busy
    # tables (which previously exhausted the connection pool). Toggle with
    # RUN_SCHEMA_MIGRATIONS. The advisory lock + lock_timeout inside ensure_schema
    # keep it safe when it does run.
    if settings.run_schema_migrations:
        ensure_schema()
    else:
        print("[lifespan] RUN_SCHEMA_MIGRATIONS=false — skipping startup DDL")
    try:
        init_form_templates()
    except Exception as e:
        print(f"[lifespan] init_form_templates: {e}")

    print("J2W Tracker API is running")

    if settings.start_scheduler_on_startup:
        task_scheduler.start()
        hrbp_scheduler.start()
    yield
    task_scheduler.stop()
    hrbp_scheduler.stop()


app = FastAPI(title="J2W Recruiter Tracking", version="1.0.0", lifespan=lifespan)


# Per-request timing → logs/requests.log (method, path, status, duration ms).
@app.middleware("http")
async def _request_timing(request, call_next):  # noqa: ANN001, ANN201
    import time as _t

    from core.obs import log_request, set_current_request

    label = f"{request.method} {request.url.path}"
    # Tag SQL queries issued during this request with the endpoint (propagates
    # into the threadpool where sync DB work runs).
    try:
        set_current_request(label)
    except Exception:  # noqa: BLE001
        pass

    start = _t.monotonic()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        ms = (_t.monotonic() - start) * 1000.0
        try:
            # user email is set on request.state by get_current_user (if authed)
            user = getattr(request.state, "user_email", "-")
            log_request(request.method, request.url.path, status, ms, user)
        except Exception:  # noqa: BLE001 — logging must never break a request
            pass


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
app.include_router(drives_router,             prefix="/api")
app.include_router(candidates_router,         prefix="/api")
app.include_router(calls_router,              prefix="/api")
app.include_router(validation_router,         prefix="/api")
app.include_router(consultant_profile_router, prefix="/api")
app.include_router(submissions_router,        prefix="/api")
app.include_router(dashboard_router,          prefix="/api")
app.include_router(resume_extract_router,     prefix="/api")
app.include_router(jd_extract_router,         prefix="/api")
app.include_router(mails_router,              prefix="/api")
app.include_router(clients_router,            prefix="/api")
app.include_router(business_heads_router,     prefix="/api")
app.include_router(export_router,             prefix="/api")
app.include_router(followup_router,           prefix="/api")
app.include_router(notifications_router,      prefix="/api")
app.include_router(demand_status_router,      prefix="/api")
app.include_router(upload_router,             prefix="/api")
app.include_router(form_config_router,        prefix="/api")
app.include_router(probing_router,            prefix="/api")
app.include_router(boolean_builder_router,    prefix="/api")
app.include_router(coo_router,                prefix="/api")
app.include_router(pods_router,               prefix="/api")
app.include_router(leaves_router,             prefix="/api")
app.include_router(client_emails_router,      prefix="/api")
app.include_router(ol_lookup_router,          prefix="/api")
app.include_router(targets_router,            prefix="/api")
app.include_router(pod_plan_router,           prefix="/api")
app.include_router(hrbp_router,               prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "J2W Recruiter Tracking API"}


# Serve HRBP frontend at /hrbp (must be registered before the main SPA catch-all).
HRBP_DIST = Path(os.getenv("HRBP_DIST", "/app/frontend_hrbp_dist"))
if HRBP_DIST.is_dir():

    if (HRBP_DIST / "assets").is_dir():
        app.mount(
            "/hrbp/assets",
            StaticFiles(directory=HRBP_DIST / "assets"),
            name="hrbp_assets",
        )

    @app.get("/hrbp")
    def _hrbp_root():
        return FileResponse(HRBP_DIST / "index.html")

    @app.get("/hrbp/{full_path:path}")
    def _hrbp_catch_all(full_path: str):
        candidate = (HRBP_DIST / full_path).resolve()
        try:
            candidate.relative_to(HRBP_DIST.resolve())
        except ValueError:
            raise StarletteHTTPException(status_code=404)
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(HRBP_DIST / "index.html")


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
        if full_path.startswith(("api/", "hrbp/", "hrbp")) or full_path == "api":
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
