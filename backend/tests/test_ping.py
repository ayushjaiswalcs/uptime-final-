"""
Ping monitor unit + integration tests.

Unit tests:        pytest backend/tests/test_ping.py -v -m "not integration"
Integration tests: pytest backend/tests/test_ping.py -v -m integration
All:               pytest backend/tests/test_ping.py -v
"""
import platform
import subprocess
import sys
import os
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.monitoring import (
    _build_ping_cmd,
    _parse_ping_output,
    _classify_ping_error,
    _ping_tcp_probe,
    _ping_tcp_fallback,
    _check_ping,
)

_SYSTEM = platform.system().lower()


# ── fixtures ─────────────────────────────────────────────────────────────────

def _monitor(host: str, timeout: int = 10, mid: int = 1):
    m = MagicMock()
    m.id = mid; m.monitor_name = f"T-{host}"; m.target_url = host; m.timeout = timeout
    return m


def _proc(stdout="", stderr="", rc=0):
    p = MagicMock()
    p.stdout = stdout; p.stderr = stderr; p.returncode = rc
    return p


# ── Windows ping output samples ───────────────────────────────────────────────

WIN_SUCCESS = """\

Pinging 8.8.8.8 with 32 bytes of data:
Reply from 8.8.8.8: bytes=32 time=4ms TTL=115
Reply from 8.8.8.8: bytes=32 time=4ms TTL=115
Reply from 8.8.8.8: bytes=32 time=3ms TTL=115

Ping statistics for 8.8.8.8:
    Packets: Sent = 3, Received = 3, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 3ms, Maximum = 4ms, Average = 4ms
"""

WIN_TIMEOUT = """\

Pinging 192.0.2.1 with 32 bytes of data:
Request timed out.
Request timed out.
Request timed out.

Ping statistics for 192.0.2.1:
    Packets: Sent = 3, Received = 0, Lost = 3 (100% loss),
"""

WIN_PARTIAL = """\

Pinging 10.0.0.1 with 32 bytes of data:
Reply from 10.0.0.1: bytes=32 time=2ms TTL=64
Request timed out.
Request timed out.

Ping statistics for 10.0.0.1:
    Packets: Sent = 3, Received = 1, Lost = 2 (66% loss),
Approximate round trip times in milli-seconds:
    Minimum = 2ms, Maximum = 2ms, Average = 2ms
"""

# ── Linux ping output samples ──────────────────────────────────────────────────

LINUX_SUCCESS = """\
PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
64 bytes from 1.1.1.1: icmp_seq=1 ttl=56 time=3.21 ms
64 bytes from 1.1.1.1: icmp_seq=2 ttl=56 time=3.10 ms
64 bytes from 1.1.1.1: icmp_seq=3 ttl=56 time=3.15 ms

--- 1.1.1.1 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2003ms
rtt min/avg/max/mdev = 3.100/3.153/3.210/0.046 ms
"""

LINUX_LOSS = """\
PING google.com (142.250.0.1) 56(84) bytes of data.
64 bytes from 142.250.0.1: icmp_seq=1 ttl=118 time=27.3 ms

--- google.com ping statistics ---
3 packets transmitted, 1 received, 66% packet loss, time 2006ms
rtt min/avg/max/mdev = 27.300/27.300/27.300/0.000 ms
"""

LINUX_DNS_FAIL = "ping: badhost.invalid: Name or service not known\n"


# ============================================================================
# _build_ping_cmd — timeout fix verification
# ============================================================================

class TestBuildPingCmd:
    def test_windows_per_packet_cap(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        cmd = _build_ping_cmd("8.8.8.8", count=3, timeout_sec=10)
        # per-packet = min(4000, 10000//3) = min(4000,3333) = 3333
        assert "-w" in cmd
        idx = cmd.index("-w")
        assert int(cmd[idx + 1]) <= 4000, "Windows per-packet timeout must be capped at 4000ms"

    def test_windows_minimum_1s(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        cmd = _build_ping_cmd("host", count=3, timeout_sec=2)
        idx = cmd.index("-w")
        assert int(cmd[idx + 1]) >= 1000

    def test_linux_per_reply_cap(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "linux")
        cmd = _build_ping_cmd("host", count=3, timeout_sec=30)
        idx = cmd.index("-W")
        assert int(cmd[idx + 1]) <= 4, "Linux -W must be capped at 4s"

    def test_macos_deadline_present(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "darwin")
        cmd = _build_ping_cmd("host", count=3, timeout_sec=10)
        assert "-t" in cmd

    def test_correct_count(self):
        for sys in ("windows", "linux", "darwin"):
            with patch("core.monitoring._SYSTEM", sys):
                cmd = _build_ping_cmd("h", count=3, timeout_sec=5)
                # count value must appear as a string in the cmd list
                assert "3" in cmd


# ============================================================================
# _parse_ping_output
# ============================================================================

class TestParsePingOutputWindows:
    @pytest.fixture(autouse=True)
    def _win(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")

    def test_success_counts(self):
        r = _parse_ping_output(WIN_SUCCESS)
        assert r["sent"] == 3 and r["received"] == 3 and r["packet_loss_pct"] == 0.0

    def test_success_latency(self):
        r = _parse_ping_output(WIN_SUCCESS)
        assert r["min_ms"] == 3.0 and r["max_ms"] == 4.0 and r["avg_ms"] == 4.0

    def test_success_ttl(self):
        assert _parse_ping_output(WIN_SUCCESS)["ttl"] == 115

    def test_total_loss(self):
        r = _parse_ping_output(WIN_TIMEOUT)
        assert r["received"] == 0 and r["packet_loss_pct"] == 100.0 and r["avg_ms"] is None

    def test_partial_loss(self):
        r = _parse_ping_output(WIN_PARTIAL)
        assert r["received"] == 1 and r["packet_loss_pct"] == 66.0

    def test_empty(self):
        r = _parse_ping_output("")
        assert r["received"] == 0 and r["packet_loss_pct"] == 100.0


class TestParsePingOutputLinux:
    @pytest.fixture(autouse=True)
    def _lnx(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "linux")

    def test_success_counts(self):
        r = _parse_ping_output(LINUX_SUCCESS)
        assert r["sent"] == 3 and r["received"] == 3 and r["packet_loss_pct"] == 0.0

    def test_success_latency(self):
        r = _parse_ping_output(LINUX_SUCCESS)
        assert r["avg_ms"] == pytest.approx(3.153) and r["min_ms"] == pytest.approx(3.1)

    def test_success_ttl(self):
        assert _parse_ping_output(LINUX_SUCCESS)["ttl"] == 56

    def test_partial_loss(self):
        r = _parse_ping_output(LINUX_LOSS)
        assert r["packet_loss_pct"] == pytest.approx(66.0) and r["received"] == 1

    def test_dns_no_crash(self):
        r = _parse_ping_output(LINUX_DNS_FAIL)
        assert r["received"] == 0


# ============================================================================
# _classify_ping_error
# ============================================================================

class TestClassifyPingError:
    def test_dns_windows(self):
        msg = _classify_ping_error("Ping request could not find host bad.host", "", "bad.host")
        assert "dns" in msg.lower() or "cannot find" in msg.lower()

    def test_dns_linux(self):
        msg = _classify_ping_error("", "ping: bad.host: Name or service not known", "bad.host")
        assert "dns" in msg.lower()

    def test_timeout(self):
        msg = _classify_ping_error("Request timed out.", "", "1.2.3.4")
        assert "timed out" in msg.lower() or "unreachable" in msg.lower()

    def test_unreachable(self):
        msg = _classify_ping_error("Destination host unreachable.", "", "h")
        assert "unreachable" in msg.lower() or "route" in msg.lower()

    def test_fallback_includes_host(self):
        msg = _classify_ping_error("weird output", "", "myhost.example")
        assert "myhost.example" in msg or "failed" in msg.lower()


# ============================================================================
# _check_ping — unit tests (mocked subprocess)
# ============================================================================

class TestCheckPingUnit:

    def _up_windows(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        proc = _proc(stdout=WIN_SUCCESS, rc=0)
        with patch("core.monitoring.subprocess.run", return_value=proc):
            return _check_ping(_monitor("8.8.8.8"))

    def test_returns_5_tuple(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        with patch("core.monitoring.subprocess.run", return_value=_proc(stdout=WIN_SUCCESS, rc=0)):
            result = _check_ping(_monitor("8.8.8.8"))
        assert len(result) == 5, "Must return a 5-tuple (is_up, rt, http_status, error, meta)"

    def test_meta_has_required_keys(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        with patch("core.monitoring.subprocess.run", return_value=_proc(stdout=WIN_SUCCESS, rc=0)):
            _, _, _, _, meta = _check_ping(_monitor("8.8.8.8"))
        assert "packet_loss" in meta and "min_ms" in meta and "max_ms" in meta

    def test_up_windows(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        with patch("core.monitoring.subprocess.run", return_value=_proc(stdout=WIN_SUCCESS, rc=0)):
            is_up, rt, _, err, meta = _check_ping(_monitor("8.8.8.8"))
        assert is_up is True
        assert rt == pytest.approx(4.0)
        assert err is None
        assert meta["packet_loss"] == 0.0

    def test_up_linux(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "linux")
        with patch("core.monitoring.subprocess.run", return_value=_proc(stdout=LINUX_SUCCESS, rc=0)):
            is_up, rt, _, err, meta = _check_ping(_monitor("1.1.1.1"))
        assert is_up is True
        assert rt == pytest.approx(3.153)
        assert meta["packet_loss"] == 0.0

    def test_partial_loss_is_up_with_warning(self, monkeypatch):
        """Partial loss still UP but error field carries the warning."""
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        with patch("core.monitoring.subprocess.run", return_value=_proc(stdout=WIN_PARTIAL, rc=0)):
            is_up, _, _, err, meta = _check_ping(_monitor("10.0.0.1"))
        assert is_up is True
        assert err is not None and "loss" in err.lower()
        assert meta["packet_loss"] == 66.0

    def test_100pct_loss_triggers_tcp_probe(self, monkeypatch):
        """When ICMP gets 100% loss, _ping_tcp_probe is called."""
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        with patch("core.monitoring.subprocess.run", return_value=_proc(stdout=WIN_TIMEOUT, rc=1)), \
             patch("core.monitoring._ping_tcp_probe", return_value=(False, 6000.0, "All TCP ports timed out")) as mock_probe:
            _check_ping(_monitor("192.0.2.1"))
        mock_probe.assert_called_once()

    def test_icmp_blocked_tcp_alive_returns_up(self, monkeypatch):
        """ICMP 100% loss but TCP probe succeeds → UP with warning."""
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        with patch("core.monitoring.subprocess.run", return_value=_proc(stdout=WIN_TIMEOUT, rc=1)), \
             patch("core.monitoring._ping_tcp_probe", return_value=(True, 15.0, "TCP/443 open")):
            is_up, rt, _, err, meta = _check_ping(_monitor("cloud.host"))
        assert is_up is True
        assert "ICMP blocked" in err or "TCP" in err
        assert meta["packet_loss"] == 100.0

    def test_icmp_and_tcp_fail_returns_down(self, monkeypatch):
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        with patch("core.monitoring.subprocess.run", return_value=_proc(stdout=WIN_TIMEOUT, rc=1)), \
             patch("core.monitoring._ping_tcp_probe", return_value=(False, 12000.0, "All TCP ports timed out")):
            is_up, _, _, err, meta = _check_ping(_monitor("115.112.99.50"))
        assert is_up is False
        assert err is not None
        assert meta["packet_loss"] == 100.0

    def test_empty_host(self):
        is_up, rt, _, err, meta = _check_ping(_monitor(""))
        assert is_up is False
        assert "empty" in err.lower() or "invalid" in err.lower()

    def test_subprocess_timeout(self, monkeypatch):
        with patch("core.monitoring.subprocess.run", side_effect=subprocess.TimeoutExpired("ping", 30)):
            is_up, _, _, err, _ = _check_ping(_monitor("1.1.1.1"))
        assert is_up is False
        assert "timed out" in err.lower()

    def test_ping_binary_missing_triggers_tcp_fallback(self, monkeypatch):
        with patch("core.monitoring.subprocess.run", side_effect=FileNotFoundError()), \
             patch("core.monitoring._ping_tcp_fallback",
                   return_value=(True, 10.0, None, "TCP/80 open", {"packet_loss": None, "min_ms": None, "max_ms": None})) as fb:
            is_up, _, _, _, _ = _check_ping(_monitor("h"))
        fb.assert_called_once()
        assert is_up is True

    def test_permission_error_triggers_tcp_fallback(self, monkeypatch):
        with patch("core.monitoring.subprocess.run", side_effect=PermissionError()), \
             patch("core.monitoring._ping_tcp_fallback",
                   return_value=(True, 12.0, None, "TCP/443 open", {"packet_loss": None, "min_ms": None, "max_ms": None})) as fb:
            _check_ping(_monitor("h"))
        fb.assert_called_once()

    def test_unexpected_exception(self):
        with patch("core.monitoring.subprocess.run", side_effect=RuntimeError("weird")):
            is_up, _, _, err, _ = _check_ping(_monitor("h"))
        assert is_up is False
        assert "weird" in err.lower() or "error" in err.lower()


# ============================================================================
# Windows per-packet timeout proof: 3 × 3333ms << 3 × 10000ms
# ============================================================================

class TestWindowsTimeoutFix:
    def test_per_packet_is_not_full_timeout(self, monkeypatch):
        """Regression: -w must NOT be timeout_sec × 1000 for Windows."""
        monkeypatch.setattr("core.monitoring._SYSTEM", "windows")
        cmd = _build_ping_cmd("h", count=3, timeout_sec=10)
        idx = cmd.index("-w")
        per_ms = int(cmd[idx + 1])
        # Old broken value was 10000; new capped value is ≤ 4000
        assert per_ms < 10000, f"Per-packet timeout {per_ms}ms is too high (was the bug)"
        assert per_ms >= 1000, "Per-packet timeout should be at least 1s"


# ============================================================================
# Integration tests — require real network
# ============================================================================

def _has_internet():
    import socket
    try:
        socket.getaddrinfo("google.com", 80, socket.AF_INET)
        return True
    except Exception:
        return False


@pytest.mark.integration
@pytest.mark.skipif(not _has_internet(), reason="No internet")
class TestPingIntegration:
    """Real ICMP checks. Requires network access."""

    HOSTS = ["google.com", "github.com", "8.8.8.8", "1.1.1.1"]

    @pytest.mark.parametrize("host", HOSTS)
    def test_host_is_up(self, host):
        is_up, rt, _, err, meta = _check_ping(_monitor(host))
        assert is_up, f"{host} should be UP (err={err!r})"

    @pytest.mark.parametrize("host", HOSTS)
    def test_response_time_plausible(self, host):
        is_up, rt, _, _, _ = _check_ping(_monitor(host))
        if is_up:
            assert 0.1 <= rt <= 5000, f"rt={rt}ms implausible for {host}"

    @pytest.mark.parametrize("host", HOSTS)
    def test_returns_5_tuple(self, host):
        result = _check_ping(_monitor(host))
        assert len(result) == 5
        is_up, rt, third, err, meta = result
        assert isinstance(is_up, bool)
        assert isinstance(rt, float)
        assert third is None
        assert isinstance(meta, dict)
        assert "packet_loss" in meta

    def test_blocked_ip_returns_down(self):
        """115.112.99.50 blocks both ICMP and TCP — must be DOWN."""
        is_up, rt, _, err, meta = _check_ping(_monitor("115.112.99.50"))
        assert is_up is False, "115.112.99.50 should be DOWN (blocks ICMP+TCP)"
        assert err is not None and len(err) > 0
        assert meta["packet_loss"] == 100.0

    def test_invalid_host_is_down(self):
        is_up, _, _, err, _ = _check_ping(_monitor("this.host.does.not.exist.invalid"))
        assert is_up is False
        assert err is not None

    def test_google_dns_latency_under_200ms(self):
        is_up, rt, _, _, _ = _check_ping(_monitor("8.8.8.8"))
        assert is_up
        assert rt < 200, f"8.8.8.8 latency {rt}ms seems too high"

    def test_wall_clock_is_fast_on_success(self):
        """With the timeout fix, even a healthy host should complete well under 5s."""
        import time
        t = time.monotonic()
        is_up, _, _, _, _ = _check_ping(_monitor("8.8.8.8", timeout=10))
        wall = time.monotonic() - t
        assert wall < 5.0, f"Successful ping took {wall:.1f}s — per-packet timeout fix may be broken"
