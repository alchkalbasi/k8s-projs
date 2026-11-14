# kind cluster: `ticketing`

A local Kubernetes cluster for Project 1, run with [kind](https://kind.sigs.k8s.io/) (Kubernetes IN Docker).
It runs on one host but has **3 nodes**: 1 control plane and 2 workers. Each node is a Docker container.

| Item            | Value |
|-----------------|-------|
| Cluster name    | `ticketing` |
| kubectl context | `kind-ticketing` |
| Node image      | `kindest/node:v1.37.0` |
| Nodes           | `ticketing-control-plane`, `ticketing-worker`, `ticketing-worker2` |
| API server      | `https://127.0.0.1:44237` (host port is random, mapped to `6443` in the control-plane container) |
| App access      | `kubectl port-forward` (no Ingress, NodePort or `extraPortMappings`) |

Config: [config.yml](config.yml)

## Create / delete

Run from `ticketing-pr1/`:

```bash
kind create cluster --config kind/config.yml
kind get clusters                  # -> ticketing
kubectl config use-context kind-ticketing

kind delete cluster --name ticketing
```

## Verify the cluster

```console
$ kubectl cluster-info
Kubernetes control plane is running at https://127.0.0.1:44237
CoreDNS is running at https://127.0.0.1:44237/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

$ kubectl get nodes
NAME                      STATUS   ROLES           AGE   VERSION
ticketing-control-plane   Ready    control-plane   27h   v1.37.0
ticketing-worker          Ready    <none>          27h   v1.37.0
ticketing-worker2         Ready    <none>          27h   v1.37.0
```

## Nodes are just Docker containers

On the host, `docker ps` shows the three kind nodes next to the docker-compose stack:

```console
$ docker ps
IMAGE                      STATUS                  PORTS                            NAMES
kindest/node:v1.37.0       Up 27 hours             127.0.0.1:44237->6443/tcp        ticketing-control-plane
kindest/node:v1.37.0       Up 27 hours                                              ticketing-worker2
kindest/node:v1.37.0       Up 27 hours                                              ticketing-worker
```

- Only the control plane publishes a port (the API server). Workers have none.
- The `ticketing-*-1` containers are the docker-compose stack, **not** part of the cluster.
  The two run side by side without conflict.

## Looking inside a node

```bash
docker exec -it ticketing-control-plane bash
```

There is **no `docker`** inside a node. kind nodes run **containerd**, so use these instead:

| Tool     | Purpose |
|----------|---------|
| `crictl` | CRI client, the kubelet's view (pods, containers, images). Use this one. |
| `ctr`    | Low-level containerd client. Kubernetes images live in the `k8s.io` namespace: `ctr -n k8s.io images ls` |

Useful `crictl` commands:

```bash
crictl ps          # running containers
crictl pods        # pod sandboxes
crictl images      # images on this node
crictl logs <id>   # container logs
```

`crictl ps` on the control plane shows the control-plane components running as **static pods**
plus the per-node add-ons:

| Container                 | Namespace            | What it is |
|---------------------------|----------------------|------------|
| `kube-apiserver`          | kube-system          | API server (static pod) |
| `etcd`                    | kube-system          | Cluster state store (static pod) |
| `kube-scheduler`          | kube-system          | Assigns pods to nodes (static pod) |
| `kube-controller-manager` | kube-system          | Runs the controllers (static pod) |
| `kube-proxy`              | kube-system          | Service networking (DaemonSet, one per node) |
| `kindnet-cni`             | kube-system          | kind's default CNI (DaemonSet, one per node) |
| `coredns` x2              | kube-system          | Cluster DNS (Deployment) |
| `local-path-provisioner`  | local-path-storage   | Default StorageClass `standard` for PVCs |

`crictl` only sees **its own node**. Running it on `ticketing-worker` shows that worker's
`kube-proxy` and `kindnet` plus any app pods scheduled there. For a cluster-wide view, use
`kubectl get pods -A -o wide`.

The static pod manifests are in `/etc/kubernetes/manifests/` on the control-plane node.

## Next: getting the app images into the cluster

The nodes can't see images in the host's Docker. Local images (`ticketing-backend:0.1.0`,
`ticketing-frontend:0.1.0`) must be loaded into every node before pods can use them:

```bash
kind load docker-image ticketing-backend:0.1.0 ticketing-frontend:0.1.0 --name ticketing

# check on a node
docker exec ticketing-worker crictl images | grep ticketing
```

Use `imagePullPolicy: IfNotPresent` (or `Never`) in the manifests, and use a fixed tag rather than `:latest`.
Otherwise Kubernetes tries to pull from a registry and the pod ends up in `ErrImagePull`.
