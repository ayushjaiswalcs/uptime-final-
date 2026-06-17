from celery import Celery
from celery.schedules import crontab
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# include=["tasks"] forces the worker to import tasks.py on startup so
# dispatch_all_checks / check_monitor / send_alert are registered. Without it,
# `celery -A celery_app worker` starts with zero tasks and beat's scheduled
# "tasks.dispatch_all_checks" fails with NotRegistered.
app = Celery("uptime_worker", broker=REDIS_URL, backend=REDIS_URL, include=["tasks"])

app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "dispatch-monitor-checks": {
            "task": "tasks.dispatch_all_checks",
            "schedule": 30.0,  # every 30 seconds
        },
    },
)
