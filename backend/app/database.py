"""
SQLAlchemy database setup for SQLite.

Provides the engine, session factory, declarative base, and a dependency
generator (get_db) for FastAPI route injection.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


class Base(DeclarativeBase):
    """Declarative base class for all ORM models."""
    pass


def get_db() -> Session:
    """
    FastAPI dependency that yields a SQLAlchemy session.

    The session is automatically closed after the request completes,
    regardless of success or failure.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
