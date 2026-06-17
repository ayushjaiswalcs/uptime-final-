"""Integration tests for check_monitor against the real database.

run_check is monkeypatched to deterministic results so we test the persistence
and incident-lifecycle logic, not live network behaviour.
"""
import core.monitoring as monitoring
from models.monitor_log import MonitorLog
from models.incident import Incident


def _set_result(monkeypatch, is_up, error=None):
    monkeypatch.setattr(
        monitoring, "run_check",
        lambda m: (is_up, 12.3, 200 if is_up else 503, error),
    )


def test_check_creates_log_and_sets_status(db, monitor, monkeypatch):
    _set_result(monkeypatch, True)
    monitoring.check_monitor(monitor.id)

    logs = db.query(MonitorLog).filter(MonitorLog.monitor_id == monitor.id).all()
    assert len(logs) == 1
    assert logs[0].is_up is True
    assert logs[0].response_time == 12.3

    db.refresh(monitor)
    assert monitor.current_status == "up"
    assert monitor.last_checked_at is not None


def test_down_opens_incident(db, monitor, monkeypatch):
    _set_result(monkeypatch, False, error="Expected 200, got 503")
    monitoring.check_monitor(monitor.id)

    db.refresh(monitor)
    assert monitor.current_status == "down"
    assert monitor.failure_count == 1

    incidents = db.query(Incident).filter(Incident.monitor_id == monitor.id).all()
    assert len(incidents) == 1
    assert incidents[0].incident_status == "ongoing"
    assert incidents[0].recovery_time is None


def test_recovery_resolves_incident_without_duplicates(db, monitor, monkeypatch):
    # Two consecutive failures (threshold=1) must NOT open two incidents.
    _set_result(monkeypatch, False, error="down")
    monitoring.check_monitor(monitor.id)
    monitoring.check_monitor(monitor.id)

    open_incidents = db.query(Incident).filter(
        Incident.monitor_id == monitor.id, Incident.incident_status == "ongoing"
    ).all()
    assert len(open_incidents) == 1  # no duplicate for the same outage

    # Recovery resolves it.
    _set_result(monkeypatch, True)
    monitoring.check_monitor(monitor.id)

    # check_monitor commits in its own session; drop our session's cached
    # copies so the assertions below read the freshly committed rows.
    db.expire_all()
    db.refresh(monitor)
    assert monitor.current_status == "up"
    assert monitor.failure_count == 0

    resolved = db.query(Incident).filter(
        Incident.monitor_id == monitor.id, Incident.incident_status == "resolved"
    ).all()
    assert len(resolved) == 1
    assert resolved[0].recovery_time is not None
    assert db.query(Incident).filter(
        Incident.monitor_id == monitor.id, Incident.incident_status == "ongoing"
    ).count() == 0


def test_threshold_delays_incident(db, monitor, monkeypatch):
    monitor.alert_threshold = 3
    db.commit()
    _set_result(monkeypatch, False, error="down")

    monitoring.check_monitor(monitor.id)
    monitoring.check_monitor(monitor.id)
    # Below threshold: no incident yet.
    assert db.query(Incident).filter(Incident.monitor_id == monitor.id).count() == 0

    monitoring.check_monitor(monitor.id)  # 3rd failure hits threshold
    assert db.query(Incident).filter(Incident.monitor_id == monitor.id).count() == 1
