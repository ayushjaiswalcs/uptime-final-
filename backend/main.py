from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging

from core.config import settings
from database import engine, Base
from core.monitoring import monitoring_loop
from core.ws_manager import manager
from api.routes import auth, monitors, incidents, notifications, dashboard, status_pages, admin
from api.routes import api_keys, organizations, maintenance, webhooks, audit, reports
from api.routes import teams as teams_router, projects as projects_router, comments as comments_router
from api.routes import sla as sla_router, oncall as oncall_router, runbooks as runbooks_router
from api.routes import apm as apm_router, compliance as compliance_router, costs as costs_router
from api.routes import escalation as escalation_router
import models  # ensures all models are registered

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Start the in-process monitoring engine (replaces Celery for local/single-process runs).
    # Skip it when a dedicated Celery worker owns checks (ENABLE_INPROCESS_MONITOR=false),
    # otherwise checks run twice and incidents double-fire.
    monitor_task = None
    escalation_task = None
    if settings.ENABLE_INPROCESS_MONITOR:
        monitor_task = asyncio.create_task(monitoring_loop())
        # The escalation advance loop rides alongside the in-process monitor:
        # both own the incident lifecycle, so they start/stop together.
        from core.escalation_engine import ESCALATION_TICK_SECONDS, process_due_escalations
        from database import SessionLocal

        async def escalation_loop():
            logging.getLogger("uptime.escalation").info(
                "Escalation engine started (tick=%ss)", ESCALATION_TICK_SECONDS
            )
            while True:
                try:
                    await asyncio.to_thread(_run_escalation_tick)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001
                    logging.getLogger("uptime.escalation").warning("Escalation loop error: %s", exc)
                await asyncio.sleep(ESCALATION_TICK_SECONDS)

        def _run_escalation_tick():
            db = SessionLocal()
            try:
                process_due_escalations(db)
            finally:
                db.close()

        # Seed default matrices for any users missing them (idempotent).
        try:
            from core.escalation_seed import seed_missing_default_matrices
            from database import SessionLocal as _SL
            _db = _SL()
            try:
                seed_missing_default_matrices(_db)
            finally:
                _db.close()
        except Exception as exc:  # noqa: BLE001
            logging.getLogger("uptime.escalation").warning("Matrix seed skipped: %s", exc)

        escalation_task = asyncio.create_task(escalation_loop())
    else:
        logging.getLogger("uptime").info("In-process monitor disabled (ENABLE_INPROCESS_MONITOR=false)")
    yield
    for task in (monitor_task, escalation_task):
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="Uptime API",
    description="AI-Powered Website, API & Server Monitoring Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(monitors.router)
app.include_router(incidents.router)
app.include_router(notifications.router)
app.include_router(dashboard.router)
app.include_router(status_pages.router)
app.include_router(admin.router)
app.include_router(api_keys.router)
app.include_router(organizations.router)
app.include_router(maintenance.router)
app.include_router(webhooks.router)
app.include_router(audit.router)
app.include_router(reports.router)
app.include_router(teams_router.router)
app.include_router(projects_router.router)
app.include_router(comments_router.router)
app.include_router(sla_router.router)
app.include_router(oncall_router.router)
app.include_router(runbooks_router.router)
app.include_router(apm_router.router)
app.include_router(compliance_router.router)
app.include_router(costs_router.router)
app.include_router(escalation_router.router)


# manager is imported from core.ws_manager — shared with monitoring engine


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await manager.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "uptime-api"}
