# DevOps Ticketing System (ticketing-pr1)

A small ticketing system for DevOps work: incidents, deployments, access requests,
infra changes, bugs and tasks.

| Component  | Stack                                  | Port |
|------------|----------------------------------------|------|
| `backend`  | Python 3.12, FastAPI, SQLAlchemy 2     | 8000 |
| `frontend` | Next.js 15 static export, served by nginx | 3000 → 8080 |
| `db`       | PostgreSQL 16                          | 5432 (internal) |

```
browser ──> frontend (nginx :8080) ──/api/*──> backend (FastAPI :8000) ──> PostgreSQL
```

The browser only talks to the frontend. The UI is a Next.js static export (plain HTML/JS)
served by nginx, which also proxies `/api/*` to the backend. `BACKEND_URL` is substituted
into the nginx config at container **start**, so the same image works in docker-compose
and in Kubernetes without a rebuild. Ticket pages live at `/tickets/view?id=N`.

## Quick start (Docker)

```bash
cp .env.example .env          # optional: change DB credentials
docker compose up -d --build
```

- UI: http://localhost:3000
- API docs (Swagger): http://localhost:8000/docs

To stop: `docker compose down`. Add `-v` to also delete the database volume.

**Backend build fails with `No matching distribution found` / pip read timeouts?**
pypi.org is slow or blocked from your network. Build through a PyPI mirror by setting
`PIP_INDEX_URL` in `.env` (see `.env.example`) or on the command line:

```bash
PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple docker compose up -d --build
```

Use a mirror you trust: it serves the packages that end up in your image.

## Features

- Ticket types: `incident`, `deployment`, `access_request`, `infra_change`, `bug`, `task`
- Priority `P1`–`P4`, environment `dev` / `staging` / `production`, service/component, reporter, assignee
- Workflow: `open → in_progress → blocked → resolved → closed`. `resolved_at` is set automatically.
- Comments / activity log on each ticket
- Dashboard counters (total, open P1, count per status)
- Filtering by status, priority, type and environment, plus full-text search

## API

| Method | Path                            | Description                              |
|--------|---------------------------------|------------------------------------------|
| GET    | `/api/tickets`                  | List tickets. Query params: `status`, `priority`, `type`, `environment`, `assignee`, `q`, `limit`, `offset` |
| POST   | `/api/tickets`                  | Create a ticket                          |
| GET    | `/api/tickets/stats`            | Aggregated counts                        |
| GET    | `/api/tickets/{id}`             | Ticket with its comments                 |
| PATCH  | `/api/tickets/{id}`             | Partial update                           |
| DELETE | `/api/tickets/{id}`             | Delete a ticket                          |
| POST   | `/api/tickets/{id}/comments`    | Add a comment                            |
| GET    | `/healthz`                      | Liveness (backend and frontend). No DB call. |
| GET    | `/readyz`                       | Readiness (backend): startup delay elapsed, config file valid, DB reachable. Otherwise 503 |
| GET    | `/version`                      | `{"version":"0.1.0","commit":"abc123"}` (also at `/api/version`, used by the UI footer) |
| GET    | `/config`                       | Non-secret config loaded from the config file |

Example:

```bash
curl -X POST localhost:8000/api/tickets -H 'Content-Type: application/json' -d '{
  "title": "Payments API 5xx spike",
  "type": "incident", "priority": "P1", "environment": "production",
  "service": "payments-api", "reporter": "alice"
}'
```

## Configuration

| Service  | Variable       | Default                    | Notes |
|----------|----------------|----------------------------|-------|
| backend  | `DATABASE_URL` | `sqlite:///./tickets.db`   | e.g. `postgresql+psycopg://user:pass@host:5432/db` |
| backend  | `CORS_ORIGINS` | `http://localhost:3000`    | Comma-separated. Only needed for direct browser→API calls. |
| backend  | `APP_VERSION` / `GIT_COMMIT` | `dev` / `unknown` | Stamped at build time via `--build-arg`; returned by `/version` |
| backend  | `LOG_LEVEL`    | `INFO`                     | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| backend  | `STARTUP_DELAY_SECONDS` | `0`               | `/readyz` returns 503 for N seconds after boot |
| backend  | `CONFIG_FILE`  | `/etc/ticketing/app.yaml`  | YAML with `welcome_message` and `features`. Missing file means defaults; an invalid file fails `/readyz` |
| frontend | `BACKEND_URL`  | `http://backend:8000`      | nginx `/api/*` upstream, set at container start. No trailing slash. The host must resolve when nginx starts |
| frontend | `APP_VERSION` (build arg) | `dev`        | Baked into the bundle, shown in the UI footer |

The default config file ([backend/config/app.yaml](backend/config/app.yaml)) is baked
into the image. The backend logs one line on startup with the version and every config value it loaded
(the DB password is masked).

## Build the images

Images are tagged with explicit versions only, never `:latest`.

```bash
docker build --build-arg APP_VERSION=0.1.0 --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  -t ticketing-backend:0.1.0 ./backend
docker build --build-arg APP_VERSION=0.1.0 -t ticketing-frontend:0.1.0 ./frontend
```

Both are multi-stage builds. Size history is in [EXPERIMENTS.md](EXPERIMENTS.md).

| Image | Build stage | Runtime stage | User |
|-------|-------------|---------------|------|
| backend | `python:3.12-slim` + pip, installs deps into `/opt/venv` | `python:3.12-slim` + the venv + `app/` | `10001` |
| frontend | `node:22-alpine`, `npm ci && npm run build` → `out/` | `nginx:1.27-alpine` + `out/` | `101` (nginx) |

Test the backend on its own:

```bash
docker run --rm -p 8080:8000 -e STARTUP_DELAY_SECONDS=10 ticketing-backend:0.1.0

curl -i localhost:8080/healthz    # 200 right away
curl -i localhost:8080/readyz     # 503 for the first 10s, then 200
curl    localhost:8080/version    # {"version":"0.1.0","commit":"..."}
```

Without `DATABASE_URL` the image falls back to SQLite in `/tmp`, so it runs on its own.
Add `--build-arg PIP_INDEX_URL=...` if you need a PyPI mirror.

## Probes and shutdown

- **Liveness** (`/healthz`): "is the process stuck?" A failure restarts the container, so it never
  touches the DB. A DB outage must not cause a restart loop.
- **Readiness** (`/readyz`): "can I take traffic right now?" A failure only removes the pod from the
  Service endpoints.
- **SIGTERM**: uvicorn runs as PID 1 (exec-form `CMD`). It stops accepting connections, waits up to
  20s for in-flight requests, runs the shutdown hook and exits 0. Keep the pod's
  `terminationGracePeriodSeconds` above 20 (the default of 30 is fine).
  In Kubernetes, endpoint removal lags SIGTERM slightly. If you see errors during rollouts, add a
  `preStop` sleep of a few seconds.

## Local development (without Docker)

```bash
# backend (uses SQLite by default)
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload            # http://localhost:8000
pytest -q

# frontend
cd frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev   # http://localhost:3000 (dev server proxies /api)
```

## Kubernetes notes

The images are built with Kubernetes in mind:

- Both containers run as non-root (backend UID `10001`, frontend UID `101`) and keep no local state.
- Probes: backend liveness `GET /healthz :8000`, readiness `GET /readyz :8000`; frontend `GET /healthz :8080`.
- Mount a ConfigMap at `/etc/ticketing` to replace `app.yaml`. Check what was loaded with `GET /config`.
- The UI footer polls the backend `/version` every 5s, so you can watch a rolling update happen.
- Set the frontend's `BACKEND_URL` to the backend Service, e.g. `http://ticketing-backend:8000`.
- Put `DATABASE_URL` in a Secret.
- The backend creates its tables on startup (`create_all`). That is fine for this
  project. For real schema changes, add Alembic migrations and run them as an init container or Job.

## Not included yet

- No authentication or authorization. Reporter and assignee are free-text names.
  Put the app behind an auth proxy (e.g. oauth2-proxy) or add OIDC before exposing it.
- No database migrations (see the Kubernetes notes above).
