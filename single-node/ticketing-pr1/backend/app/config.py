import logging
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_WELCOME = "Welcome to DevOps Tickets"


class Settings(BaseSettings):
    """Settings read from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "DevOps Ticketing API"
    # Stamped into the image by the Dockerfile (build args APP_VERSION / GIT_COMMIT).
    app_version: str = "dev"
    git_commit: str = "unknown"
    # SQLite by default for local dev; docker-compose / k8s set a PostgreSQL URL.
    database_url: str = "sqlite:///./tickets.db"
    # Comma-separated list of allowed origins. The Next.js frontend proxies
    # requests server-side, so CORS is only needed when calling the API directly.
    cors_origins: str = "http://localhost:3000"
    log_level: str = "INFO"
    # /readyz returns 503 for this many seconds after boot (readiness experiments).
    startup_delay_seconds: float = 0
    # Optional YAML file with non-secret app config (mount a ConfigMap here in k8s).
    config_file: str = "/etc/ticketing/app.yaml"

    @field_validator("log_level")
    @classmethod
    def _valid_log_level(cls, v: str) -> str:
        v = v.upper()
        if v not in logging.getLevelNamesMapping():
            raise ValueError(f"unknown log level {v!r}")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


@dataclass
class FileConfig:
    """Config read from the YAML file. `error` is set when the file exists but is invalid."""

    welcome_message: str = DEFAULT_WELCOME
    features: dict[str, bool] = field(default_factory=dict)
    source: str = "defaults"
    error: str | None = None


def load_file_config(path: str) -> FileConfig:
    p = Path(path)
    if not p.is_file():
        return FileConfig(source=f"defaults ({path} not found)")
    try:
        data = yaml.safe_load(p.read_text()) or {}
        if not isinstance(data, dict):
            raise ValueError("top level must be a mapping")
        features = data.get("features") or {}
        if not isinstance(features, dict):
            raise ValueError("'features' must be a mapping")
        return FileConfig(
            welcome_message=str(data.get("welcome_message", DEFAULT_WELCOME)),
            features={str(k): bool(v) for k, v in features.items()},
            source=str(p),
        )
    except (OSError, yaml.YAMLError, ValueError) as exc:
        return FileConfig(source=str(p), error=f"{type(exc).__name__}: {exc}")
