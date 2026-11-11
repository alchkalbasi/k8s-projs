# Experiments

## Phase 2: image size, before vs after

Measured with `docker images | grep ticketing` (uncompressed size on disk).

### Before

| Image | Size | Notes |
|-------|------|-------|
| `ticketing-backend:0.1.0` | 301 MB | Already multi-stage: `python:3.12-slim` + venv. Base image ~206 MB, venv ~95 MB (with pip, `uvicorn[standard]` extras) |
| `ticketing-frontend:latest` | 332 MB | Next.js standalone server on `node:22-alpine` (node runtime ~160 MB, app ~70 MB) |

### After

| Image | Size | Change | What changed |
|-------|------|--------|--------------|
| `ticketing-backend:0.1.0` | 279 MB | -22 MB (-7%) | venv built `--without-pip`; `uvicorn[standard]` replaced by `uvicorn` + `uvloop` + `httptools` (no `watchfiles`/`websockets`); venv 95 → 75 MB |
| `ticketing-frontend:0.1.0` | 74.9 MB | -257 MB (-77%) | Next.js static export served by `nginx:1.27-alpine`; no Node runtime in the final image |
| **Total** | **354 MB** | **-279 MB (-44%)** | from 633 MB |

Both images: multi-stage, non-root (backend `10001`, frontend `101`), explicit version tags,
`.dockerignore` keeps `.git`, `node_modules`, `.env` and tests out of the build context.

**Resume bullet:** Cut container image footprint 44% (633 MB → 354 MB) with multi-stage builds;
frontend image 77% smaller (332 MB → 75 MB) by serving a static Next.js export from non-root nginx.

### Why the backend didn't shrink more

The remaining ~205 MB is the `python:3.12-slim` base image itself (Debian + CPython).
Getting below that means changing the base:

- `python:3.12-alpine` (~60 MB base). All deps have musllinux wheels, but musl can be slower and
  can break some wheels.
- Distroless Python (`gcr.io/distroless/python3-debian12`, ~50 MB). No shell, so debugging needs
  `kubectl debug`, and its Python version must match the builder's.

Candidate for a later experiment.
