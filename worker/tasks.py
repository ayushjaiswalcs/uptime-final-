import asyncio
import os
import json
from datetime import datetime, timezone
from celery_app import app
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://uptime:uptime_secret@localhost:5432/uptime_db")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
Session = sessionmaker(bind=engine)
Base = declarative_base()

# Lazy imports to avoid circular deps
def get_models():
    from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, ForeignKey
    from sqlalchemy.sql import func

    class Monitor(Base):
        __tablename__ = "monitors"
        id = Column(Integer, primary_key=True)
        user_id = Column(Integer)
        monitor_name = Column(String)
        target_url = Column(Text)
        monitor_type = Column(String, default="http")
        interval = Column(Integer, default=300)
        timeout = Column(Integer, default=10)
        http_method = Column(String, default="GET")
        expected_status_code = Column(Integer, default=200)
        custom_headers = Column(Text)
        request_body = Column(Text)
        current_status = Column(String, default="pending")
        is_paused = Column(Boolean, default=False)
        uptime_percentage = Column(String, default="100.00")
        last_checked_at = Column(DateTime(timezone=True))

    class MonitorLog(Base):
        __tablename__ = "monitor_logs"
        id = Column(Integer, primary_key=True)
        monitor_id = Column(Integer, ForeignKey("monitors.id"))
        response_time = Column(Float)
        http_status = Column(Integer)
        is_up = Column(Boolean)
        error_message = Column(String(500))
        checked_at = Column(DateTime(timezone=True), server_default=func.now())

    class Incident(Base):
        __tablename__ = "incidents"
        id = Column(Integer, primary_key=True)
        monitor_id = Column(Integer, ForeignKey("monitors.id"))
        outage_start_time = Column(DateTime(timezone=True), server_default=func.now())
        recovery_time = Column(DateTime(timezone=True))
        error_message = Column(Text)
        incident_status = Column(String, default="ongoing")

    class Notification(Base):
        __tablename__ = "notifications"
        id = Column(Integer, primary_key=True)
        user_id = Column(Integer)
        notification_type = Column(String)
        destination = Column(String)
        enabled = Column(Boolean, default=True)

    return Monitor, MonitorLog, Incident, Notification


@app.task
def dispatch_all_checks():
    Monitor, _, _, _ = get_models()
    db = Session()
    try:
        now = datetime.now(timezone.utc)
        monitors = db.query(Monitor).filter(Monitor.is_paused == False).all()
        for monitor in monitors:
            last = monitor.last_checked_at
            if last is None or (now - last).total_seconds() >= monitor.interval:
                check_monitor.delay(monitor.id)
    finally:
        db.close()


@app.task
def check_monitor(monitor_id: int):
    Monitor, MonitorLog, Incident, Notification = get_models()
    db = Session()
    try:
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id).first()
        if not monitor or monitor.is_paused:
            return

        is_up, response_time, http_status, error = run_check(monitor)

        log = MonitorLog(
            monitor_id=monitor.id,
            response_time=response_time,
            http_status=http_status,
            is_up=is_up,
            error_message=error,
            checked_at=datetime.now(timezone.utc),
        )
        db.add(log)

        previous_status = monitor.current_status
        monitor.current_status = "up" if is_up else "down"
        monitor.last_checked_at = datetime.now(timezone.utc)

        recalculate_uptime(db, monitor, MonitorLog)

        if previous_status != "down" and not is_up:
            incident = Incident(
                monitor_id=monitor.id,
                error_message=error,
                incident_status="ongoing",
            )
            db.add(incident)
            db.flush()
            send_alert.delay(monitor.id, monitor.user_id, "down", error or "Service unreachable")

        elif previous_status == "down" and is_up:
            open_incident = db.query(Incident).filter(
                Incident.monitor_id == monitor.id,
                Incident.incident_status == "ongoing"
            ).first()
            if open_incident:
                open_incident.incident_status = "resolved"
                open_incident.recovery_time = datetime.now(timezone.utc)
            send_alert.delay(monitor.id, monitor.user_id, "up", "Service has recovered")

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error checking monitor {monitor_id}: {e}")
    finally:
        db.close()


def run_check(monitor):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        if monitor.monitor_type == "http":
            from checks.http_check import http_check
            headers = json.loads(monitor.custom_headers) if monitor.custom_headers else {}
            result = loop.run_until_complete(
                http_check(monitor.target_url, monitor.http_method, monitor.timeout,
                           monitor.expected_status_code, headers, monitor.request_body)
            )
            return result
        elif monitor.monitor_type == "tcp":
            from checks.tcp_check import tcp_check
            from urllib.parse import urlparse
            parsed = urlparse(f"//{monitor.target_url}")
            is_up, rt, err = loop.run_until_complete(
                tcp_check(parsed.hostname, parsed.port or 80, monitor.timeout)
            )
            return is_up, rt, None, err
        elif monitor.monitor_type == "ssl":
            from checks.ssl_check import ssl_check
            from urllib.parse import urlparse
            parsed = urlparse(monitor.target_url)
            is_up, rt, err = ssl_check(parsed.hostname or monitor.target_url)
            return is_up, rt, None, err
        else:
            return True, None, None, None
    finally:
        loop.close()


def recalculate_uptime(db, monitor, MonitorLog):
    from sqlalchemy import func
    from datetime import timedelta
    since = datetime.now(timezone.utc) - timedelta(days=30)
    total = db.query(MonitorLog).filter(MonitorLog.monitor_id == monitor.id, MonitorLog.checked_at >= since).count()
    up = db.query(MonitorLog).filter(MonitorLog.monitor_id == monitor.id, MonitorLog.checked_at >= since, MonitorLog.is_up == True).count()
    if total > 0:
        monitor.uptime_percentage = f"{(up / total * 100):.2f}"


@app.task
def send_alert(monitor_id: int, user_id: int, status: str, message: str):
    _, _, _, Notification = get_models()
    db = Session()
    try:
        notifications = db.query(Notification).filter(
            Notification.user_id == user_id, Notification.enabled == True
        ).all()
        for notif in notifications:
            try:
                if notif.notification_type == "email":
                    send_email_alert(notif.destination, monitor_id, status, message)
                elif notif.notification_type == "telegram":
                    send_telegram_alert(notif.destination, monitor_id, status, message)
            except Exception as e:
                print(f"Alert send error ({notif.notification_type}): {e}")
    finally:
        db.close()


def send_email_alert(to_email: str, monitor_id: int, status: str, message: str):
    import smtplib
    from email.mime.text import MIMEText
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASSWORD", "")
    from_email = os.getenv("FROM_EMAIL", "noreply@uptime.io")
    if not smtp_host or not smtp_user:
        return
    emoji = "✅" if status == "up" else "🔴"
    subject = f"{emoji} Monitor #{monitor_id} is {status.upper()}"
    body = f"Monitor #{monitor_id} status changed to {status.upper()}.\n\nDetails: {message}"
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    with smtplib.SMTP(smtp_host, int(os.getenv("SMTP_PORT", 587))) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(from_email, [to_email], msg.as_string())


def send_telegram_alert(chat_id: str, monitor_id: int, status: str, message: str):
    import urllib.request
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return
    emoji = "✅" if status == "up" else "🔴"
    text = f"{emoji} Monitor #{monitor_id} is *{status.upper()}*\n_{message}_"
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=5)
