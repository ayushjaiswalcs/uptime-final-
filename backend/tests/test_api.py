"""API tests: registration, monitor creation persistence, dashboard reads."""
import uuid

import pytest
from fastapi.testclient import TestClient

import api.routes.monitors as monitors_route
from main import app
from database import SessionLocal
from models.user import User


@pytest.fixture()
def client(db, monkeypatch):
    # Don't fire a real network check from the create-monitor background task.
    monkeypatch.setattr(monitors_route, "check_monitor", lambda *a, **k: None)
    return TestClient(app)


@pytest.fixture()
def auth(client):
    email = f"api_{uuid.uuid4().hex[:10]}@example.com"
    resp = client.post("/auth/register", json={
        "name": "API User", "email": email, "password": "password123",
    })
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    yield {"Authorization": f"Bearer {token}"}, email
    # Cleanup the user (cascades to monitors/logs/incidents).
    session = SessionLocal()
    try:
        u = session.query(User).filter(User.email == email).first()
        if u:
            session.delete(u)
            session.commit()
    finally:
        session.close()


def test_create_monitor_persists_all_fields(client, auth):
    headers, _ = auth
    resp = client.post("/monitors", headers=headers, json={
        "monitor_name": "My Site",
        "target_url": "https://example.com",
        "monitor_type": "http",
        "interval": 300,
        "timeout": 10,
        "expected_status_code": 200,
    })
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["target_url"] == "https://example.com"
    assert body["monitor_type"] == "http"
    assert body["interval"] == 300
    assert body["timeout"] == 10
    assert body["expected_status_code"] == 200
    assert body["current_status"] == "pending"
    assert body["id"] > 0


def test_monitor_appears_in_list_and_dashboard(client, auth):
    headers, _ = auth
    client.post("/monitors", headers=headers, json={
        "monitor_name": "Site A", "target_url": "https://example.com",
        "monitor_type": "http", "interval": 300, "timeout": 10,
        "expected_status_code": 200,
    })

    listed = client.get("/monitors", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    stats = client.get("/dashboard/stats", headers=headers)
    assert stats.status_code == 200
    assert stats.json()["total_monitors"] == 1


def test_dashboard_charts_return_real_series(client, auth):
    headers, _ = auth
    uptime = client.get("/dashboard/uptime-chart", headers=headers)
    rt = client.get("/dashboard/response-time-chart", headers=headers)
    incidents = client.get("/dashboard/recent-incidents", headers=headers)
    assert uptime.status_code == 200 and len(uptime.json()) == 7
    assert rt.status_code == 200 and len(rt.json()) == 7
    assert incidents.status_code == 200 and incidents.json() == []


def test_requires_auth(client):
    assert client.get("/monitors").status_code in (401, 403)
