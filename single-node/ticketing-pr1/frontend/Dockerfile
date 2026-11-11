# syntax=docker/dockerfile:1

# ---- stage 1: build. Full Node toolchain, produces static files in out/ ----
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
# Baked into the JS bundle and shown in the UI footer.
ARG APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
RUN npm run build

# ---- stage 2: runtime. Just nginx and the static files; no Node at all ----
FROM nginx:1.27-alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/templates/ /etc/nginx/templates/
COPY --from=builder /app/out /usr/share/nginx/html

# Run as the image's built-in non-root user "nginx" (uid 101). The entrypoint renders
# templates into conf.d at startup, so that directory must be writable by it.
RUN rm -f /etc/nginx/conf.d/default.conf \
 && chown -R 101:101 /etc/nginx/conf.d

ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="ticketing-frontend" \
      org.opencontainers.image.version=${APP_VERSION}

# Default for docker-compose; in Kubernetes set it to the backend Service URL.
ENV BACKEND_URL=http://backend:8000 \
    NGINX_ENVSUBST_FILTER=^BACKEND_URL$

USER 101:101
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
