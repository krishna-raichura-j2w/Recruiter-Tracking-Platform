from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from core.config import settings

_url = settings.active_db_url

# PostgreSQL / Supabase — optimised for pgBouncer transaction-mode pooler
engine = create_engine(
    _url,
    pool_size=5,
    max_overflow=5,
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
