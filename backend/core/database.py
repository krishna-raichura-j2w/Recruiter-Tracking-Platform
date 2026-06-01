from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from core.config import settings

_url = settings.active_db_url

# PostgreSQL / Supabase — optimised for pgBouncer transaction-mode pooler
# Connection budget is the hard limit here: Postgres max_connections=79 (~76 usable).
# With uvicorn --workers 10, each worker gets its own pool, so per-worker connections
# must stay small: 10 workers × (pool_size 3 + max_overflow 3) = 60 max, leaving
# headroom for the scheduler, startup migrations, and ad-hoc queries.
engine = create_engine(
    _url,
    pool_size=3,
    max_overflow=3,
    pool_timeout=30,
    pool_recycle=300,
    pool_pre_ping=True,
)

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
