from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from core.config import settings

_url = settings.active_db_url

# PostgreSQL / Supabase — optimised for pgBouncer transaction-mode pooler.
# Connection budget is the hard limit: Postgres max_connections=79 (~76 usable).
# RDS max_connections=79. Cap the app's footprint well under it so a load burst
# can't saturate RDS (which would refuse connections for everyone with
# "remaining connection slots are reserved"). 10 workers × (3 + 2) = 50 max,
# leaving ~29 for system/reserved slots, the OL-sync scripts and ad-hoc queries.
# pool_timeout is effectively disabled: a checkout WAITS for a free connection
# instead of raising QueuePool TimeoutError — bursts queue inside the app rather
# than melting down RDS. The query/request timing logs (core/obs) show what's slow.
_NO_TIMEOUT = 60 * 60 * 24  # 1 day — effectively "never time out"
engine = create_engine(
    _url,
    pool_size=3,
    max_overflow=2,
    pool_timeout=_NO_TIMEOUT,
    pool_recycle=300,
    pool_pre_ping=True,
)

# Per-query timing → logs/queries.log
try:
    from core.obs import instrument_engine, setup_logging

    setup_logging()
    instrument_engine(engine)
except Exception as _e:  # noqa: BLE001 — observability must never break startup
    print(f"[database] obs instrumentation skipped: {_e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from infra import models  # noqa: F401 — triggers model registration

    Base.metadata.create_all(bind=engine)
