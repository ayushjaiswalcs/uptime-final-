"""In-process monitoring engine.

Runs real uptime checks without Celery/Redis so the app is fully functional in
local/single-process deployments. A background asyncio loop periodically checks
monitors that are due; new monitors are also checked immediately on creation.

Each check runs in a worker thread (via asyncio.to_thread) using synchronous
network + DB calls, which avoids mixing async DB sessions.

Supported monitor types: http, tcp, ssl, ping, dns, keyword
"""
import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import platform
import re
import socket
import ssl
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from urllib.parse import urlparse

import httpx

from core.config import settings
from core.ws_manager import manager as ws_manager
from database import SessionLocal
from models.monitor import Monitor
from models.monitor_log import MonitorLog
from models.incident import Incident
from models.notification import Notification
from models.webhook import WebhookEndpoint, WebhookDelivery
from models.maintenance_window import MaintenanceWindow

logger = logging.getLogger("uptime.monitoring")

TICK_SECONDS = 15
MAX_CONCURRENCY = 10
UPTIME_WINDOW_DAYS = 30


# --------------------------------------------------------------------------- #
# Network checks (synchronous, run inside a thread)
# --------------------------------------------------------------------------- #
def _check_http(monitor: Monitor):
    headers = {}
    if monitor.custom_headers:
        try:
            headers = json.loads(monitor.custom_headers)
        except (ValueError, TypeError):
            headers = {}
    start = time.monotonic()
    try:
        with httpx.Client(verify=False, follow_redirects=True, timeout=monitor.timeout) as client:
            kwargs = {"headers": headers}
            if monitor.request_body and monitor.http_method in ("POST", "PUT", "PATCH"):
                kwargs["content"] = monitor.request_body
            resp = client.request(monitor.http_method or "GET", monitor.target_url, **kwargs)
        elapsed = round((time.monotonic() - start) * 1000, 2)
        is_up = resp.status_code == monitor.expected_status_code
        error = None if is_up else f"Expected {monitor.expected_status_code}, got {resp.status_code}"
        return is_up, elapsed, resp.status_code, error
    except httpx.TimeoutException:
        return False, round((time.monotonic() - start) * 1000, 2), None, f"Timeout after {monitor.timeout}s"
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, str(exc)[:200]


def _check_keyword(monitor: Monitor):
    """HTTP check that additionally verifies a keyword is present in the response body."""
    headers = {}
    if monitor.custom_headers:
        try:
            headers = json.loads(monitor.custom_headers)
        except (ValueError, TypeError):
            headers = {}
    start = time.monotonic()
    keyword = monitor.keyword or ""
    try:
        with httpx.Client(verify=False, follow_redirects=True, timeout=monitor.timeout) as client:
            resp = client.get(monitor.target_url, headers=headers)
        elapsed = round((time.monotonic() - start) * 1000, 2)
        if resp.status_code != monitor.expected_status_code:
            return False, elapsed, resp.status_code, f"Status {resp.status_code} != expected {monitor.expected_status_code}"
        if keyword and keyword not in resp.text:
            return False, elapsed, resp.status_code, f"Keyword '{keyword}' not found in response"
        return True, elapsed, resp.status_code, None
    except httpx.TimeoutException:
        return False, round((time.monotonic() - start) * 1000, 2), None, f"Timeout after {monitor.timeout}s"
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, str(exc)[:200]


def _host_port(target: str, default_port: int):
    parsed = urlparse(target if "//" in target else f"//{target}")
    host = parsed.hostname or target
    return host, (parsed.port or default_port)


def _check_tcp(monitor: Monitor):
    host, port = _host_port(monitor.target_url, 80)
    start = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=monitor.timeout):
            elapsed = round((time.monotonic() - start) * 1000, 2)
            return True, elapsed, None, None
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, f"TCP connect failed: {str(exc)[:160]}"


# --------------------------------------------------------------------------- #
# Ping helpers (ICMP via subprocess + smart TCP probe fallback)
# --------------------------------------------------------------------------- #
_SYSTEM = platform.system().lower()  # "windows" | "linux" | "darwin"

# Packets per ICMP check — 3 gives meaningful packet-loss percentage
_PING_COUNT = 3


def _build_ping_cmd(host: str, count: int, timeout_sec: int) -> list[str]:
    """
    Build the platform-appropriate ping command.

    CRITICAL (Windows): -w is per-packet wait in milliseconds, NOT total timeout.
    Sending 3 packets with -w 10000 means a fully unreachable host takes 30 s.
    Fix: cap per-packet wait at 4 000 ms so worst-case = count × 4 s = 12 s.
    """
    if _SYSTEM == "windows":
        # Per-packet wait: evenly divide total timeout, cap at 4 000 ms
        per_ms = max(1000, min(4000, (timeout_sec * 1000) // count))
        return ["ping", "-n", str(count), "-w", str(per_ms), host]
    elif _SYSTEM == "darwin":
        # -c count, -t overall deadline (seconds)
        deadline = min(timeout_sec, count * 4 + 2)
        return ["ping", "-c", str(count), "-t", str(deadline), host]
    else:
        # Linux: -W is per-reply timeout in seconds; cap at 4 s
        per_sec = max(1, min(4, timeout_sec // count))
        return ["ping", "-c", str(count), "-W", str(per_sec), "-i", "0.5", host]


def _parse_ping_output(stdout: str) -> dict:
    """
    Parse ping stdout for both Windows and Unix output formats.

    Returns dict with keys:
      sent, received, packet_loss_pct, avg_ms, min_ms, max_ms, ttl
    """
    result: dict = {
        "sent": 0, "received": 0,
        "packet_loss_pct": 100.0,
        "avg_ms": None, "min_ms": None, "max_ms": None,
        "ttl": None,
    }

    if _SYSTEM == "windows":
        # Packets: Sent = 3, Received = 3, Lost = 0 (0% loss)
        m = re.search(
            r"Sent\s*=\s*(\d+),\s*Received\s*=\s*(\d+),\s*Lost\s*=\s*\d+\s*\((\d+)%",
            stdout, re.IGNORECASE,
        )
        if m:
            result["sent"] = int(m.group(1))
            result["received"] = int(m.group(2))
            result["packet_loss_pct"] = float(m.group(3))

        # Minimum = 27ms, Maximum = 28ms, Average = 27ms
        m = re.search(
            r"Minimum\s*=\s*(\d+)ms,\s*Maximum\s*=\s*(\d+)ms,\s*Average\s*=\s*(\d+)ms",
            stdout, re.IGNORECASE,
        )
        if m:
            result["min_ms"] = float(m.group(1))
            result["max_ms"] = float(m.group(2))
            result["avg_ms"] = float(m.group(3))

        # TTL from reply line: TTL=115
        m = re.search(r"TTL\s*=\s*(\d+)", stdout, re.IGNORECASE)
        if m:
            result["ttl"] = int(m.group(1))

    else:
        # Linux/macOS: "3 packets transmitted, 3 received, 0% packet loss"
        m = re.search(r"(\d+)\s+packets?\s+transmitted,\s+(\d+)\s+(?:packets?\s+)?received", stdout)
        if m:
            result["sent"] = int(m.group(1))
            result["received"] = int(m.group(2))

        m = re.search(r"([\d.]+)%\s+packet\s+loss", stdout)
        if m:
            result["packet_loss_pct"] = float(m.group(1))

        # Linux:  rtt min/avg/max/mdev = 1.234/2.345/3.456/0.567 ms
        # macOS:  round-trip min/avg/max/stddev = 1.234/2.345/3.456/0.567 ms
        m = re.search(
            r"(?:rtt|round-trip)\s+min/avg/max/\S+\s*=\s*([\d.]+)/([\d.]+)/([\d.]+)",
            stdout,
        )
        if m:
            result["min_ms"] = float(m.group(1))
            result["avg_ms"] = float(m.group(2))
            result["max_ms"] = float(m.group(3))

        # TTL from reply: ttl=115 or TTL=115
        m = re.search(r"ttl\s*=\s*(\d+)", stdout, re.IGNORECASE)
        if m:
            result["ttl"] = int(m.group(1))

    return result


def _classify_ping_error(stdout: str, stderr: str, host: str) -> str:
    """Map raw ping output text to a human-readable error string."""
    combined = (stdout + stderr).lower()
    if any(k in combined for k in ("could not find host", "name or service not known",
                                    "nodename nor servname", "unknown host",
                                    "bad address", "no address")):
        return f"DNS resolution failed: cannot find host '{host}'"
    if any(k in combined for k in ("request timed out", "100% packet loss",
                                    "no response", "0 received")):
        return f"Host unreachable: all packets timed out ({host})"
    if any(k in combined for k in ("destination host unreachable", "network unreachable",
                                    "no route to host")):
        return f"Network unreachable: no route to host '{host}'"
    if any(k in combined for k in ("transmit failed", "general failure")):
        return f"Network transmit failed (check adapter/firewall for {host})"
    if any(k in combined for k in ("permission denied", "operation not permitted")):
        return f"ICMP blocked: permission denied (try TCP fallback)"
    return f"Ping failed for '{host}': all packets lost"


def _ping_tcp_probe(host: str, per_port_timeout: int = 2) -> Tuple[bool, float, Optional[str]]:
    """
    Fast TCP reachability probe used AFTER ICMP failure.

    Tries ports 443 → 80 → 22 → 8080 with a short per-port timeout.
    Returns (is_alive, response_time_ms, detail_message).
    ConnectionRefused = host is alive but port is closed = host UP.
    Timeout = no reply = skip to next port.
    """
    start = time.monotonic()
    for port in (443, 80, 22, 8080):
        t0 = time.monotonic()
        try:
            with socket.create_connection((host, port), timeout=per_port_timeout):
                rt = round((time.monotonic() - t0) * 1000, 2)
                logger.info("[PING-TCP] host=%r port=%s OPEN (%sms)", host, port, rt)
                return True, rt, f"TCP/{port} open"
        except ConnectionRefusedError:
            rt = round((time.monotonic() - t0) * 1000, 2)
            logger.info("[PING-TCP] host=%r port=%s REFUSED — host alive (%sms)", host, port, rt)
            return True, rt, f"TCP/{port} refused (port closed but host alive)"
        except (socket.timeout, TimeoutError, OSError):
            continue

    elapsed = round((time.monotonic() - start) * 1000, 2)
    # All TCP ports timed out — check if DNS at least resolves
    try:
        socket.getaddrinfo(host, None, socket.AF_INET)
        return False, elapsed, "All TCP ports timed out (host may block ICMP + TCP)"
    except socket.gaierror:
        return False, elapsed, f"DNS resolution failed for '{host}'"


def _ping_tcp_fallback(host: str, timeout: int) -> Tuple[bool, float, None, Optional[str], dict]:
    """Activate when the PING binary itself is unavailable (no root / Docker)."""
    logger.info("[PING-FALLBACK] ping binary unavailable, TCP probe for host=%r", host)
    alive, rt, detail = _ping_tcp_probe(host, per_port_timeout=min(timeout, 3))
    meta: dict = {"packet_loss": 100.0 if not alive else None, "min_ms": None, "max_ms": None}
    if alive:
        return True, rt, None, f"ICMP unavailable — {detail} (TCP fallback)", meta
    return False, rt, None, detail or "Host unreachable via ICMP and TCP", meta


def _check_ping(monitor: Monitor) -> Tuple[bool, float, None, Optional[str], dict]:
    """
    Real ICMP ping check via system subprocess.

    Return: (is_up, response_time_ms, None, error_or_None, ping_meta)
      ping_meta = {"packet_loss": float, "min_ms": float|None, "max_ms": float|None}

    Strategy:
      1. Run platform-correct ICMP ping (fixed per-packet timeout)
      2. Parse: packet_loss%, avg/min/max ms, TTL
      3. If ICMP succeeds (≥1 reply) → UP
      4. If ICMP 100% loss → TCP probe (covers firewalled ICMP / cloud servers)
         4a. TCP alive → UP with "ICMP blocked" warning
         4b. TCP also fails → DOWN with specific reason
      5. On binary missing / PermissionError → TCP-only path

    Per-packet timeout fix (Windows -w, Linux -W):
      -w is PER PACKET, not total. cap at 4 000 ms so worst-case = count × 4 s.
    """
    target = (monitor.target_url or "").strip()
    parsed_url = urlparse(target if "//" in target else f"//{target}")
    host = (parsed_url.hostname or target).strip()
    timeout_sec = max(2, int(monitor.timeout or 10))
    count = _PING_COUNT

    logger.debug(
        "[PING] monitor_id=%s name=%r host=%r timeout=%ss",
        monitor.id, monitor.monitor_name, host, timeout_sec,
    )

    if not host:
        logger.error("[PING] monitor_id=%s has empty host from target_url=%r", monitor.id, target)
        return False, 0.0, None, "Invalid monitor: empty host/target", {"packet_loss": 100.0, "min_ms": None, "max_ms": None}

    start = time.monotonic()
    cmd = _build_ping_cmd(host, count, timeout_sec)
    # Subprocess hard ceiling: count × 4 s per packet + 4 s overhead
    proc_timeout = count * min(4, timeout_sec) + 4

    logger.debug("[PING] cmd=%s proc_timeout=%ss", " ".join(cmd), proc_timeout)

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=proc_timeout)
        elapsed_wall = round((time.monotonic() - start) * 1000, 2)
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""

        logger.debug(
            "[PING] rc=%s wall=%sms\n  STDOUT: %s\n  STDERR: %s",
            proc.returncode, elapsed_wall,
            stdout.strip()[:600], stderr.strip()[:200],
        )

        stats = _parse_ping_output(stdout)
        logger.debug("[PING] parsed=%s", stats)

        avg_ms       = stats["avg_ms"]
        min_ms       = stats["min_ms"]
        max_ms       = stats["max_ms"]
        packet_loss  = stats["packet_loss_pct"]
        received     = stats["received"]
        ttl          = stats["ttl"]

        meta: dict = {"packet_loss": packet_loss, "min_ms": min_ms, "max_ms": max_ms}
        response_time = avg_ms if avg_ms is not None else elapsed_wall
        is_up = (proc.returncode == 0) and (received > 0)

        # ── At least one ICMP reply received ─────────────────────────────────
        if is_up:
            error: Optional[str] = None
            if packet_loss > 0:
                error = (
                    f"{packet_loss:.0f}% packet loss "
                    f"(avg {avg_ms}ms, min {min_ms}ms, max {max_ms}ms)"
                )
            logger.info(
                "[PING] host=%r -> UP avg=%sms min=%sms max=%sms loss=%s%% ttl=%s",
                host, avg_ms, min_ms, max_ms, packet_loss, ttl,
            )
            return True, response_time, None, error, meta

        # ── ICMP 100% loss — try TCP probe before marking DOWN ────────────────
        logger.warning(
            "[PING] ICMP 100%% loss for host=%r (rc=%s). Probing TCP reachability…",
            host, proc.returncode,
        )
        tcp_per_port = min(3, max(1, timeout_sec // 4))
        alive, tcp_rt, tcp_detail = _ping_tcp_probe(host, per_port_timeout=tcp_per_port)

        meta["packet_loss"] = 100.0  # ICMP view is always 100% loss

        if alive:
            # Host is UP but blocks ICMP (firewall / cloud instance / ISP policy)
            warn = f"ICMP blocked by firewall — {tcp_detail} (avg latency: {tcp_rt}ms)"
            logger.info("[PING] host=%r -> UP (ICMP blocked, TCP alive): %s", host, warn)
            return True, tcp_rt, None, warn, meta

        # Both ICMP and TCP failed
        icmp_reason = _classify_ping_error(stdout, stderr, host)
        tcp_reason  = tcp_detail or "all TCP ports also timed out"
        error = f"{icmp_reason}. {tcp_reason}."
        logger.warning(
            "[PING] host=%r -> DOWN (ICMP+TCP). rc=%s loss=%s%% recv=%s/%s  tcp=%s",
            host, proc.returncode, packet_loss, received, stats["sent"], tcp_reason,
        )
        return False, elapsed_wall, None, error, meta

    except subprocess.TimeoutExpired:
        elapsed_wall = round((time.monotonic() - start) * 1000, 2)
        error = f"Ping subprocess timed out after {proc_timeout}s for '{host}'"
        logger.error("[PING] host=%r SUBPROCESS TIMEOUT %ss", host, proc_timeout)
        meta = {"packet_loss": 100.0, "min_ms": None, "max_ms": None}
        return False, elapsed_wall, None, error, meta

    except FileNotFoundError:
        logger.warning("[PING] 'ping' binary not found, TCP fallback for %r", host)
        return _ping_tcp_fallback(host, timeout_sec)

    except PermissionError:
        logger.warning("[PING] ICMP permission denied (no CAP_NET_RAW), TCP fallback for %r", host)
        return _ping_tcp_fallback(host, timeout_sec)

    except OSError as exc:
        if "not permitted" in str(exc).lower() or "permission" in str(exc).lower():
            logger.warning("[PING] ICMP OS permission error (%s), TCP fallback for %r", exc, host)
            return _ping_tcp_fallback(host, timeout_sec)
        elapsed_wall = round((time.monotonic() - start) * 1000, 2)
        logger.error("[PING] OSError host=%r: %s", host, exc)
        return False, elapsed_wall, None, f"Ping OS error: {str(exc)[:160]}", {"packet_loss": 100.0, "min_ms": None, "max_ms": None}

    except Exception as exc:  # noqa: BLE001
        elapsed_wall = round((time.monotonic() - start) * 1000, 2)
        logger.error("[PING] Unexpected error host=%r: %s", host, exc, exc_info=True)
        return False, elapsed_wall, None, f"Ping error: {str(exc)[:160]}", {"packet_loss": 100.0, "min_ms": None, "max_ms": None}


def _check_ssl(monitor: Monitor):
    host, port = _host_port(monitor.target_url, 443)
    start = time.monotonic()
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((host, port), timeout=monitor.timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
        elapsed = round((time.monotonic() - start) * 1000, 2)
        not_after = cert.get("notAfter") if cert else None
        if not_after:
            expires = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
            days_left = (expires - datetime.now(timezone.utc)).days
            if days_left < 0:
                return False, elapsed, None, "SSL certificate has expired"
            if days_left <= 14:
                return True, elapsed, None, f"SSL certificate expires in {days_left} days"
        return True, elapsed, None, None
    except ssl.SSLError as exc:
        return False, round((time.monotonic() - start) * 1000, 2), None, f"SSL error: {str(exc)[:160]}"
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, f"SSL check failed: {str(exc)[:160]}"


def _check_dns(monitor: Monitor):
    """Resolve a hostname via DNS and verify it returns at least one result."""
    target = monitor.target_url.strip()
    # Strip scheme/path — keep only hostname
    parsed = urlparse(target if "//" in target else f"//{target}")
    host = parsed.hostname or target
    record_type = (monitor.dns_record_type or "A").upper()
    start = time.monotonic()
    try:
        if record_type in ("A", "AAAA"):
            family = socket.AF_INET6 if record_type == "AAAA" else socket.AF_INET
            results = socket.getaddrinfo(host, None, family)
            elapsed = round((time.monotonic() - start) * 1000, 2)
            if not results:
                return False, elapsed, None, f"DNS: no {record_type} records for {host}"
            return True, elapsed, None, None
        else:
            # For MX/CNAME/TXT we fall back to a plain A-record lookup as a connectivity proxy
            results = socket.getaddrinfo(host, None)
            elapsed = round((time.monotonic() - start) * 1000, 2)
            if not results:
                return False, elapsed, None, f"DNS resolution failed for {host}"
            return True, elapsed, None, None
    except socket.gaierror as exc:
        return False, round((time.monotonic() - start) * 1000, 2), None, f"DNS failed: {str(exc)[:160]}"
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, f"DNS check error: {str(exc)[:160]}"


def _is_private_target(target: str) -> bool:
    """Best-effort SSRF guard: resolve the host and flag private/loopback/
    link-local/reserved addresses (e.g. 127.0.0.1, 10.x, 169.254.169.254)."""
    parsed = urlparse(target if "//" in target else f"//{target}")
    host = parsed.hostname or target
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        # Unresolvable — let the actual check report the failure normally.
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return True
    return False


def run_check(monitor: Monitor):
    """
    Return (is_up, response_time_ms, http_status, error_message, ping_meta).

    ping_meta is a dict {"packet_loss", "min_ms", "max_ms"} for ping monitors,
    None for all other monitor types.
    """
    if not settings.ALLOW_PRIVATE_TARGETS and _is_private_target(monitor.target_url):
        return False, 0.0, None, "Target resolves to a private/internal address (blocked)", None
    mtype = (monitor.monitor_type or "http").lower()
    if mtype == "ping":
        return _check_ping(monitor)   # already 5-tuple
    # All other check functions return 4-tuple; add None meta for consistency
    if mtype == "tcp":
        return (*_check_tcp(monitor), None)
    if mtype == "ssl":
        return (*_check_ssl(monitor), None)
    if mtype == "dns":
        return (*_check_dns(monitor), None)
    if mtype == "keyword":
        return (*_check_keyword(monitor), None)
    return (*_check_http(monitor), None)


# --------------------------------------------------------------------------- #
# Maintenance window check (synchronous)
# --------------------------------------------------------------------------- #
def _in_maintenance(db, monitor_id: int) -> bool:
    now = datetime.now(timezone.utc)
    windows = db.query(MaintenanceWindow).filter(
        MaintenanceWindow.starts_at <= now,
        MaintenanceWindow.ends_at >= now,
    ).all()
    for w in windows:
        if w.affected_monitors:
            try:
                ids = json.loads(w.affected_monitors)
                if monitor_id in ids:
                    return True
            except (ValueError, TypeError):
                pass
    return False


# --------------------------------------------------------------------------- #
# Webhook delivery (synchronous)
# --------------------------------------------------------------------------- #
def _deliver_webhooks(db, user_id: int, event: str, payload: dict) -> None:
    endpoints = db.query(WebhookEndpoint).filter(
        WebhookEndpoint.user_id == user_id,
        WebhookEndpoint.is_active.is_(True),
    ).all()
    payload_json = json.dumps(payload)
    for ep in endpoints:
        # Filter by subscribed events
        if ep.events:
            try:
                subscribed = json.loads(ep.events)
                if event not in subscribed:
                    continue
            except (ValueError, TypeError):
                pass
        headers = {"Content-Type": "application/json", "X-Uptime-Event": event}
        if ep.secret:
            sig = hmac.new(ep.secret.encode(), payload_json.encode(), hashlib.sha256).hexdigest()
            headers["X-Uptime-Signature"] = f"sha256={sig}"
        success = False
        resp_status = None
        resp_body = None
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.post(ep.url, content=payload_json, headers=headers)
            resp_status = resp.status_code
            resp_body = resp.text[:500]
            success = 200 <= resp.status_code < 300
        except Exception as exc:  # noqa: BLE001
            resp_body = str(exc)[:500]
        db.add(WebhookDelivery(
            endpoint_id=ep.id, event=event, payload=payload_json,
            response_status=resp_status, response_body=resp_body, success=success,
        ))
        ep.last_triggered_at = datetime.now(timezone.utc)
    db.commit()


# --------------------------------------------------------------------------- #
# Persisting a check result + incident lifecycle (synchronous, own DB session)
# --------------------------------------------------------------------------- #
def _recalculate_uptime(db, monitor):
    since = datetime.now(timezone.utc) - timedelta(days=UPTIME_WINDOW_DAYS)
    total = db.query(MonitorLog).filter(MonitorLog.monitor_id == monitor.id, MonitorLog.checked_at >= since).count()
    up = db.query(MonitorLog).filter(
        MonitorLog.monitor_id == monitor.id, MonitorLog.checked_at >= since, MonitorLog.is_up.is_(True)
    ).count()
    if total > 0:
        monitor.uptime_percentage = f"{(up / total * 100):.2f}"


def _get_alert_threshold(monitor: Monitor) -> int:
    return max(1, monitor.alert_threshold or 1)


def check_monitor(monitor_id: int) -> None:
    """Run a single check and persist its result. Safe to call from a thread."""
    db = SessionLocal()
    try:
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id).first()
        if not monitor or monitor.is_paused:
            return

        # Skip checks during active maintenance windows
        if _in_maintenance(db, monitor_id):
            logger.debug("Monitor %s skipped (maintenance window)", monitor_id)
            return

        is_up, response_time, http_status, error, ping_meta = run_check(monitor)
        now = datetime.now(timezone.utc)
        logger.info(
            "Checked monitor=%s name=%r type=%s -> %s (%sms, http=%s)%s",
            monitor.id, monitor.monitor_name, monitor.monitor_type,
            "UP" if is_up else "DOWN", response_time, http_status,
            f" error={error!r}" if error else "",
        )

        db.add(MonitorLog(
            monitor_id=monitor.id,
            response_time=response_time,
            http_status=http_status,
            is_up=is_up,
            error_message=error,
            checked_at=now,
            # Ping-specific metrics (None for all other monitor types)
            packet_loss=ping_meta.get("packet_loss") if ping_meta else None,
            ping_min_ms=ping_meta.get("min_ms") if ping_meta else None,
            ping_max_ms=ping_meta.get("max_ms") if ping_meta else None,
        ))

        previous_status = monitor.current_status
        monitor.current_status = "up" if is_up else "down"
        monitor.last_checked_at = now

        # Track consecutive failure count
        if not is_up:
            monitor.failure_count = (monitor.failure_count or 0) + 1
        else:
            monitor.failure_count = 0

        _recalculate_uptime(db, monitor)

        threshold = _get_alert_threshold(monitor)

        # Trigger a new incident exactly when consecutive failures hit the threshold.
        # Using == (not >=) means we fire once per outage: on the N-th failure.
        # On subsequent failures failure_count > threshold so the condition stays False
        # until the monitor recovers (resetting failure_count to 0).
        if not is_up and monitor.failure_count == threshold:
            incident = Incident(monitor_id=monitor.id, error_message=error, incident_status="ongoing", outage_start_time=now)
            db.add(incident)
            db.flush()
            logger.warning(
                "Incident OPENED monitor=%s name=%r after %s consecutive failure(s): %s",
                monitor.id, monitor.monitor_name, threshold, error,
            )
            _send_alerts(db, monitor, "down", error)
            down_payload = {
                "event": "monitor.down",
                "monitor_id": monitor.id,
                "monitor_name": monitor.monitor_name,
                "monitor_type": monitor.monitor_type,
                "target_url": monitor.target_url,
                "error": error,
                "consecutive_failures": monitor.failure_count,
                "alert_threshold": threshold,
                "incident_id": incident.id,
                "timestamp": now.isoformat(),
            }
            _deliver_webhooks(db, monitor.user_id, "monitor.down", down_payload)
            _deliver_webhooks(db, monitor.user_id, "incident.created", {
                "event": "incident.created",
                "incident_id": incident.id,
                "monitor_id": monitor.id,
                "monitor_name": monitor.monitor_name,
                "target_url": monitor.target_url,
                "error": error,
                "started_at": now.isoformat(),
                "timestamp": now.isoformat(),
            })
        elif previous_status == "down" and is_up:
            open_incident = db.query(Incident).filter(
                Incident.monitor_id == monitor.id, Incident.incident_status == "ongoing"
            ).first()
            duration_mins = None
            if open_incident:
                open_incident.incident_status = "resolved"
                open_incident.recovery_time = now
                start = open_incident.outage_start_time
                if start.tzinfo is None:
                    from datetime import timezone as _tz
                    start = start.replace(tzinfo=_tz.utc)
                duration_mins = round((now - start).total_seconds() / 60, 1)
                logger.info(
                    "Incident RESOLVED monitor=%s name=%r (incident_id=%s)",
                    monitor.id, monitor.monitor_name, open_incident.id,
                )
            _send_alerts(db, monitor, "up", None)
            _deliver_webhooks(db, monitor.user_id, "monitor.up", {
                "event": "monitor.up",
                "monitor_id": monitor.id,
                "monitor_name": monitor.monitor_name,
                "monitor_type": monitor.monitor_type,
                "target_url": monitor.target_url,
                "uptime_percentage": monitor.uptime_percentage,
                "response_time_ms": response_time,
                "duration_mins": duration_mins,
                "incident_id": open_incident.id if open_incident else None,
                "timestamp": now.isoformat(),
            })
            if open_incident:
                _deliver_webhooks(db, monitor.user_id, "incident.resolved", {
                    "event": "incident.resolved",
                    "incident_id": open_incident.id,
                    "monitor_id": monitor.id,
                    "monitor_name": monitor.monitor_name,
                    "target_url": monitor.target_url,
                    "started_at": open_incident.outage_start_time.isoformat(),
                    "resolved_at": now.isoformat(),
                    "duration_mins": duration_mins,
                    "timestamp": now.isoformat(),
                })

        db.commit()
        logger.debug("Persisted check result for monitor %s", monitor_id)

        # Push live update to any open dashboard tabs for this user.
        ws_manager.broadcast_from_thread(monitor.user_id, {
            "type": "monitor_status",
            "monitor_id": monitor.id,
            "monitor_name": monitor.monitor_name,
            "status": monitor.current_status,
            "uptime": monitor.uptime_percentage,
            "message": f"{monitor.monitor_name} is {'UP' if is_up else 'DOWN'}",
        })
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        # exc_info=True logs the full traceback; the loop keeps running so one
        # bad monitor never takes the whole engine down.
        logger.error("Check failed for monitor %s: %s", monitor_id, exc, exc_info=True)
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Alert dispatching (synchronous, called within check_monitor's DB session)
# --------------------------------------------------------------------------- #
def _send_alerts(db, monitor: Monitor, status: str, error: Optional[str]) -> None:
    from core.email import send_email, smtp_configured
    notifications = db.query(Notification).filter(
        Notification.user_id == monitor.user_id,
        Notification.enabled.is_(True),
    ).all()
    subject = f"[Uptime] {monitor.monitor_name} is {'DOWN' if status == 'down' else 'back UP'}"
    body_lines = [
        f"Monitor: {monitor.monitor_name}",
        f"URL: {monitor.target_url}",
        f"Status: {'DOWN' if status == 'down' else 'UP'}",
    ]
    if error:
        body_lines.append(f"Error: {error}")
    body = "\n".join(body_lines)

    for n in notifications:
        try:
            ntype = n.notification_type.lower()
            if ntype == "email" and smtp_configured():
                send_email(n.destination, subject, body)
            elif ntype == "telegram":
                _send_telegram(n.destination, body)
            elif ntype in ("slack", "discord"):
                _send_slack_discord(n.destination, body)
            elif ntype == "webhook":
                _send_custom_webhook(n.destination, {
                    "monitor_name": monitor.monitor_name,
                    "status": status,
                    "error": error,
                })
        except Exception as exc:  # noqa: BLE001
            logger.warning("Alert send failed (%s) for monitor %s: %s", n.notification_type, monitor.id, exc)


def _send_telegram(chat_id: str, text: str) -> None:
    from core.config import settings
    if not settings.TELEGRAM_BOT_TOKEN:
        return
    with httpx.Client(timeout=10) as client:
        client.post(
            f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": text},
        )


def _send_slack_discord(webhook_url: str, text: str) -> None:
    with httpx.Client(timeout=10) as client:
        client.post(webhook_url, json={"text": text})


def _send_custom_webhook(url: str, payload: dict) -> None:
    with httpx.Client(timeout=10) as client:
        client.post(url, json=payload)


# --------------------------------------------------------------------------- #
# Background loop
# --------------------------------------------------------------------------- #
def _due_monitor_ids():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due = []
        for m in db.query(Monitor).filter(Monitor.is_paused.is_(False)).all():
            if m.last_checked_at is None:
                due.append(m.id)
                continue
            last = m.last_checked_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if (now - last).total_seconds() >= m.interval:
                due.append(m.id)
        return due
    finally:
        db.close()


async def _run_due_checks():
    due = await asyncio.to_thread(_due_monitor_ids)
    if not due:
        return
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    async def guarded(mid):
        async with sem:
            await asyncio.to_thread(check_monitor, mid)

    await asyncio.gather(*(guarded(mid) for mid in due))


async def monitoring_loop():
    logger.info("Monitoring engine started (tick=%ss)", TICK_SECONDS)
    while True:
        try:
            await _run_due_checks()
        except asyncio.CancelledError:
            logger.info("Monitoring engine stopped")
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("Monitoring loop error: %s", exc)
        await asyncio.sleep(TICK_SECONDS)
