import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import FileConfig, get_settings, load_file_config
from .database import Base, SessionLocal, engine
from .routers import tickets

settings = get_settings()

logging.basicConfig(
    level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
log = logging.getLogger("ticketing")


class _State:
    """Process-wide runtime state used by the probes."""

    started_at: float = time.monotonic()
    file_config: FileConfig = FileConfig()


state = _State()


@asynccontextmanager
async def lifespan(_: FastAPI):
    state.started_at = time.monotonic()
    state.file_config = cfg = load_file_config(settings.config_file)

    log.info(
        "Starting %s version=%s commit=%s log_level=%s startup_delay_seconds=%s "
        "database=%s config_source=%s welcome_message=%r features=%s",
        settings.app_name,
        settings.app_version,
        settings.git_commit,
        settings.log_level,
        settings.startup_delay_seconds,
        engine.url.render_as_string(hide_password=True),
        cfg.source,
        cfg.welcome_message,
        cfg.features,
    )
    if cfg.error:
        log.error("Config file %s is invalid, /readyz will fail: %s", cfg.source, cfg.error)

    # Simple schema bootstrap. For production schema evolution, switch to Alembic migrations.
    Base.metadata.create_all(bind=engine)
    log.info("Database schema ready")

    yield

    # Uvicorn runs this after SIGTERM, once it has stopped accepting connections and
    # in-flight requests have finished (or --timeout-graceful-shutdown expired).
    engine.dispose()
    log.info("Shutdown complete")


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tickets.router)


@app.get("/healthz", tags=["health"])
def liveness():
    """Liveness probe: the process is up. Deliberately does not touch the DB."""
    return {"status": "ok"}


@app.get("/readyz", tags=["health"])
def readiness(response: Response):
    """Readiness probe: startup delay elapsed, config valid, database reachable."""
    remaining = settings.startup_delay_seconds - (time.monotonic() - state.started_at)
    if remaining > 0:
        response.status_code = 503
        return {"status": "starting", "ready_in_seconds": round(remaining, 1)}

    if state.file_config.error:
        response.status_code = 503
        return {"status": "unavailable", "reason": "invalid config file"}

    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        log.warning("Readiness check failed: %s", exc)
        response.status_code = 503
        return {"status": "unavailable", "reason": "database unreachable"}
    return {"status": "ready"}


# /api/version is the same endpoint, reachable through the frontend's /api/* proxy.
@app.get("/version", tags=["meta"])
@app.get("/api/version", include_in_schema=False)
def version():
    """Build version, stamped into the image via APP_VERSION / GIT_COMMIT."""
    return {"version": settings.app_version, "commit": settings.git_commit}


@app.get("/config", tags=["meta"])
def config():
    """Non-secret config loaded from the config file (handy for ConfigMap experiments)."""
    cfg = state.file_config
    return {"source": cfg.source, "welcome_message": cfg.welcome_message, "features": cfg.features}
