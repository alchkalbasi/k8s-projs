# Deploying the ticketing app on Kubernetes

These steps deploy the ticketing app (Postgres, a FastAPI backend and an nginx/Next.js frontend) to the
local kind cluster described in [../kind/kind.md](../kind/kind.md).

Run every command from `ticketing-pr1/`. All resources go in the `ticketing` namespace.

## Manifests

| File | Kind | Purpose |
|------|------|---------|
| [namespace.yml](namespace.yml) | Namespace | `ticketing` namespace |
| [backend-configmap.yml](backend-configmap.yml) | ConfigMap | Backend env vars and the mounted `app.yaml` |
| [postgres-service.yml](postgres-service.yml) | Service (headless) | Stable DNS name `postgres` / `postgres-0.postgres` |
| [postgres-statefulset.yml](postgres-statefulset.yml) | StatefulSet + PVC | Postgres 16 with a 1Gi volume |
| [backend-deployment.yml](backend-deployment.yml) | Deployment | 3 backend replicas on port 8000 |
| [backend-service.yml](backend-service.yml) | Service (ClusterIP) | `http://backend` (port 80 -> 8000) |
| [frontend-deployment.yml](frontend-deployment.yml) | Deployment | 2 nginx replicas on port 8080 |
| [frontend-service.yml](frontend-service.yml) | Service (ClusterIP) | `http://frontend` (port 80 -> 8080) |

Secrets are **not** stored in this repo. You create them by hand with `kubectl` (step 3).

## 0. Prerequisites

- The kind cluster `ticketing` is running and `kubectl` points at the `kind-ticketing` context.
- The app images are built locally (`docker compose build`, or build each Dockerfile yourself).

kind nodes can't see images in the host's Docker, so load them into the cluster:

```bash
kind load docker-image \
  postgres:16-alpine \
  ticketing-backend:0.1.0 \
  ticketing-frontend:0.1.0 \
  --name ticketing

# check on a node
docker exec ticketing-worker crictl images | grep -E 'postgres|ticketing'
```

<details>
<summary>If <code>kind load</code> fails (for example with multi-arch images)</summary>

Import the image straight into a node's containerd. Repeat for every node that needs it:

```bash
docker save postgres:16-alpine -o /tmp/postgres.tar
docker exec -i ticketing-worker \
  ctr -n k8s.io images import \
    --platform linux/amd64 \
    --snapshotter overlayfs \
    - < /tmp/postgres.tar

docker exec ticketing-worker crictl images | grep postgres
# docker.io/library/postgres   16-alpine   3cbd775daa284   116MB
```

</details>

## 1. Namespace

```bash
kubectl apply -f k8s/namespace.yml

# optional: make it the default namespace for this context
kubectl config set-context --current --namespace=ticketing   # or: kubens ticketing
```

## 2. Backend ConfigMap

Holds the non-secret backend settings: `LOG_LEVEL` and `TICKET_PREFIX` as env vars, and `app.yaml`
mounted at `/etc/ticketing/app.yaml`.

```bash
kubectl apply -f k8s/backend-configmap.yml
```

## 3. Secrets

Create these before Postgres and the backend. Pods that reference a missing Secret stay in
`CreateContainerConfigError`.

Pick your own password. `change-me` is a placeholder. The password must be the same in both Secrets.

```bash
kubectl -n ticketing create secret generic postgres-secret \
  --from-literal=POSTGRES_DB=tickets \
  --from-literal=POSTGRES_USER=tickets \
  --from-literal=POSTGRES_PASSWORD='change-me'

kubectl -n ticketing create secret generic backend-secret \
  --from-literal=DATABASE_URL='postgresql+psycopg://tickets:change-me@postgres:5432/tickets'
```

## 4. Postgres

Deploy Postgres first. The backend's readiness check needs the database, so backend pods
won't become Ready until Postgres is reachable.

The headless Service gives the pod a stable DNS name. The StatefulSet's `volumeClaimTemplates`
creates a PVC, which kind's default `standard` StorageClass (local-path-provisioner) fills automatically.

```bash
kubectl apply -f k8s/postgres-service.yml -f k8s/postgres-statefulset.yml
kubectl -n ticketing rollout status statefulset/postgres
kubectl -n ticketing get pvc                       # data-postgres-0 should be Bound
```

## 5. Backend Deployment

```bash
kubectl apply -f k8s/backend-deployment.yml
kubectl -n ticketing rollout status deploy/backend
kubectl -n ticketing get pods -l app=ticketing-backend -o wide   # spread across both workers?
```

If a pod isn't Ready:

```bash
kubectl -n ticketing describe pod <pod>   # check Events
kubectl -n ticketing logs <pod>
```

Test one pod directly:

```bash
kubectl -n ticketing port-forward deploy/backend 8000:8000
curl localhost:8000/healthz
curl localhost:8000/readyz
```

## 6. Backend Service

A ClusterIP Service, reachable inside the cluster as `http://backend`.

```bash
kubectl apply -f k8s/backend-service.yml
kubectl -n ticketing get svc backend
kubectl -n ticketing get endpoints backend   # should list 3 pod IPs on :8000

kubectl -n ticketing port-forward svc/backend 8000:80
curl localhost:8000/healthz
```

## 7. Frontend Deployment and Service

nginx serves the static frontend and proxies `/api` to `BACKEND_URL` (`http://backend`).

```bash
kubectl apply -f k8s/frontend-deployment.yml -f k8s/frontend-service.yml
kubectl -n ticketing rollout status deploy/frontend
kubectl -n ticketing get endpoints frontend        # should list 2 pod IPs on :8080

# check that the env var made it into the nginx config
kubectl -n ticketing exec deploy/frontend -- grep proxy_pass /etc/nginx/conf.d/default.conf
#   -> proxy_pass http://backend;
```

Test the full path:

```bash
kubectl -n ticketing port-forward svc/frontend 3000:80
curl localhost:3000/healthz          # nginx itself
curl localhost:3000/api/tickets      # nginx -> Service backend -> backend pods -> postgres
```

Then open <http://localhost:3000> in a browser.

## Request flow

```
browser -> port-forward -> Service frontend -> nginx pods
                                                 | /api
                                                 v
                                     Service backend -> backend pods -> Service postgres -> postgres-0
```

## Cleanup

```bash
kubectl delete namespace ticketing   # removes everything above, including the PVC and its data
```
