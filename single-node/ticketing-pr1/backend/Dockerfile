# syntax=docker/dockerfile:1

# ---- stage 1: build. Resolve and install deps into a self-contained venv ----
FROM python:3.12-slim AS builder

# Override to use a PyPI mirror when pypi.org is slow/unreachable from your network:
#   docker build --build-arg PIP_INDEX_URL=https://<mirror>/simple .
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_DEFAULT_TIMEOUT=120 PIP_RETRIES=10

# The venv gets no pip of its own (-13 MB); the builder's pip installs into it.
RUN python -m venv --without-pip /opt/venv

COPY requirements.txt .
# Cache mount keeps downloaded wheels between builds (not in the final image).
RUN --mount=type=cache,target=/root/.cache/pip \
    pip --python /opt/venv/bin/python install -r requirements.txt

# ---- stage 2: runtime. Only the interpreter, the venv and the app code ----
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# Fixed UID/GID so Kubernetes can enforce runAsNonRoot / runAsUser: 10001.
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY app ./app
# Default config file; mount a ConfigMap over /etc/ticketing in Kubernetes.
COPY config/app.yaml /etc/ticketing/app.yaml

# Stamp the build version (declared late so changing it doesn't bust the dep cache):
#   docker build --build-arg APP_VERSION=0.1.0 --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) .
ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown
ENV APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT} \
    # Fallback for a bare `docker run` (the /app dir is not writable by UID 10001).
    # docker-compose and k8s override this with a PostgreSQL URL.
    DATABASE_URL=sqlite:////tmp/tickets.db
LABEL org.opencontainers.image.title="ticketing-backend" \
      org.opencontainers.image.version=${APP_VERSION} \
      org.opencontainers.image.revision=${GIT_COMMIT}

USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz').status==200 else 1)"

# Exec form: uvicorn is PID 1 and receives SIGTERM directly. On SIGTERM it stops accepting
# connections, lets in-flight requests finish (up to 20s, under k8s' 30s default grace
# period), runs the lifespan shutdown and exits.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", \
     "--timeout-graceful-shutdown", "20"]
