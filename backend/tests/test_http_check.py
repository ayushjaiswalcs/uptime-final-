"""Unit tests for the HTTP monitoring check, with the network mocked out."""
import httpx
import pytest

import core.monitoring as monitoring


class _FakeResponse:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text


class _FakeClient:
    """Stands in for httpx.Client as a context manager."""
    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        if self._exc:
            raise self._exc
        return self._response

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)


def _patch_client(monkeypatch, **kwargs):
    fake = _FakeClient(**kwargs)
    monkeypatch.setattr(monitoring.httpx, "Client", lambda *a, **k: fake)
    return fake


def test_http_up_when_status_matches(monkeypatch, fake_monitor):
    _patch_client(monkeypatch, response=_FakeResponse(200))
    is_up, rt, status, error = monitoring.run_check(fake_monitor)
    assert is_up is True
    assert status == 200
    assert error is None
    assert isinstance(rt, float) and rt >= 0


def test_http_down_when_status_mismatches(monkeypatch, fake_monitor):
    _patch_client(monkeypatch, response=_FakeResponse(500))
    is_up, rt, status, error = monitoring.run_check(fake_monitor)
    assert is_up is False
    assert status == 500
    assert "500" in error


def test_http_method_is_forwarded(monkeypatch, fake_monitor):
    fake_monitor.http_method = "POST"
    fake_monitor.request_body = '{"x":1}'
    fake = _patch_client(monkeypatch, response=_FakeResponse(200))
    monitoring.run_check(fake_monitor)
    method, url, kwargs = fake.calls[0]
    assert method == "POST"
    assert kwargs.get("content") == '{"x":1}'


def test_http_timeout_is_down(monkeypatch, fake_monitor):
    _patch_client(monkeypatch, exc=httpx.TimeoutException("timed out"))
    is_up, rt, status, error = monitoring.run_check(fake_monitor)
    assert is_up is False
    assert status is None
    assert "Timeout" in error


def test_http_network_error_is_down(monkeypatch, fake_monitor):
    _patch_client(monkeypatch, exc=httpx.ConnectError("refused"))
    is_up, rt, status, error = monitoring.run_check(fake_monitor)
    assert is_up is False
    assert error  # some error message captured


def test_keyword_missing_marks_down(monkeypatch, fake_monitor):
    fake_monitor.monitor_type = "keyword"
    fake_monitor.keyword = "Welcome"
    _patch_client(monkeypatch, response=_FakeResponse(200, text="Goodbye world"))
    is_up, rt, status, error = monitoring.run_check(fake_monitor)
    assert is_up is False
    assert "Keyword" in error


def test_keyword_present_marks_up(monkeypatch, fake_monitor):
    fake_monitor.monitor_type = "keyword"
    fake_monitor.keyword = "Welcome"
    _patch_client(monkeypatch, response=_FakeResponse(200, text="Welcome home"))
    is_up, rt, status, error = monitoring.run_check(fake_monitor)
    assert is_up is True
    assert error is None
