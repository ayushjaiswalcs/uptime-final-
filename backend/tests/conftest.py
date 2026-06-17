"""Shared pytest fixtures.

The app forbids SQLite (see core/config.py), so DB-backed tests run against the
real PostgreSQL configured in DATABASE_URL. Each fixture creates its own user /
monitor rows and tears them down via ON DELETE CASCADE, so tests are isolated
and leave no residue. Tests that touch the DB skip cleanly if it's unreachable.
"""
import os
import uuid
from types import SimpleNamespace

import pytest

# Ensure the in-process monitoring loop never starts during tests.
os.environ.setdefault("ENABLE_INPROCESS_MONITOR", "false")

from database import SessionLocal, engine, Base  # noqa: E402
import models  # noqa: E402,F401  (register all models)
from models.user import User  # noqa: E402
from models.monitor import Monitor  # noqa: E402
from core.security import hash_password  # noqa: E402


def _db_available() -> bool:
    try:
        with engine.connect():
            return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(not _db_available(), reason="PostgreSQL not reachable")


@pytest.fixture()
def db():
    if not _db_available():
        pytest.skip("PostgreSQL not reachable")
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture()
def user(db):
    u = User(
        name="Test User",
        email=f"test_{uuid.uuid4().hex[:10]}@example.com",
        password_hash=hash_password("password123"),
        role="owner",
        subscription_plan="free",
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u
    # Cascade deletes monitors -> logs/incidents.
    db.delete(u)
    db.commit()


@pytest.fixture()
def monitor(db, user):
    m = Monitor(
        user_id=user.id,
        monitor_name="Example",
        target_url="https://example.com",
        monitor_type="http",
        interval=300,
        timeout=10,
        http_method="GET",
        expected_status_code=200,
        alert_threshold=1,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@pytest.fixture()
def fake_monitor():
    """Lightweight stand-in for unit-testing network checks without a DB."""
    return SimpleNamespace(
        id=1,
        monitor_name="unit",
        monitor_type="http",
        target_url="https://example.com",
        http_method="GET",
        expected_status_code=200,
        timeout=5,
        custom_headers=None,
        request_body=None,
        keyword=None,
        dns_record_type="A",
    )
