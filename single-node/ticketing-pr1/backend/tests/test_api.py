import os

os.environ["DATABASE_URL"] = "sqlite:///./test_tickets.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _create(client, **overrides):
    payload = {
        "title": "Prod DB CPU at 95%",
        "description": "Primary RDS instance is pegged",
        "type": "incident",
        "priority": "P1",
        "environment": "production",
        "service": "orders-db",
        "reporter": "alice",
    }
    payload.update(overrides)
    r = client.post("/api/tickets", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_health(client):
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/readyz").status_code == 200


def test_create_and_get(client):
    t = _create(client)
    assert t["status"] == "open"
    r = client.get(f"/api/tickets/{t['id']}")
    assert r.status_code == 200
    assert r.json()["comments"] == []


def test_validation(client):
    r = client.post("/api/tickets", json={"title": "x", "reporter": "a"})
    assert r.status_code == 422


def test_list_filters_and_search(client):
    _create(client)
    _create(client, title="Rotate TLS certs", type="infra_change", priority="P3", service="ingress")
    assert client.get("/api/tickets").json()["total"] == 2
    assert client.get("/api/tickets?type=incident").json()["total"] == 1
    assert client.get("/api/tickets?q=tls").json()["items"][0]["service"] == "ingress"
    # P1 sorts first
    assert client.get("/api/tickets").json()["items"][0]["priority"] == "P1"


def test_status_transition_sets_resolved_at(client):
    t = _create(client)
    r = client.patch(f"/api/tickets/{t['id']}", json={"status": "resolved"})
    assert r.json()["resolved_at"] is not None
    r = client.patch(f"/api/tickets/{t['id']}", json={"status": "in_progress"})
    assert r.json()["resolved_at"] is None


def test_comments_and_delete(client):
    t = _create(client)
    r = client.post(f"/api/tickets/{t['id']}/comments", json={"author": "bob", "body": "Looking"})
    assert r.status_code == 201
    assert len(client.get(f"/api/tickets/{t['id']}").json()["comments"]) == 1
    assert client.delete(f"/api/tickets/{t['id']}").status_code == 204
    assert client.get(f"/api/tickets/{t['id']}").status_code == 404


def test_stats(client):
    _create(client)
    _create(client, priority="P2")
    s = client.get("/api/tickets/stats").json()
    assert s["total"] == 2
    assert s["open_p1"] == 1
    assert s["by_status"]["open"] == 2


def test_timestamps_are_timezone_aware(client):
    t = _create(client)
    assert t["created_at"].endswith(("Z", "+00:00"))


def test_version(client):
    from app.main import settings

    expected = {"version": settings.app_version, "commit": settings.git_commit}
    assert client.get("/version").json() == expected
    assert client.get("/api/version").json() == expected


def test_readyz_waits_for_startup_delay(monkeypatch):
    from app.main import settings

    monkeypatch.setattr(settings, "startup_delay_seconds", 60)
    with TestClient(app) as c:
        r = c.get("/readyz")
        assert r.status_code == 503
        assert r.json()["status"] == "starting"
        assert c.get("/healthz").status_code == 200  # liveness unaffected

    monkeypatch.setattr(settings, "startup_delay_seconds", 0)
    with TestClient(app) as c:
        assert c.get("/readyz").status_code == 200


def test_config_file_loaded(monkeypatch, tmp_path):
    from app.main import settings

    f = tmp_path / "app.yaml"
    f.write_text("welcome_message: hi there\nfeatures:\n  beta: true\n")
    monkeypatch.setattr(settings, "config_file", str(f))
    with TestClient(app) as c:
        assert c.get("/config").json() == {
            "source": str(f),
            "welcome_message": "hi there",
            "features": {"beta": True},
        }
        assert c.get("/readyz").status_code == 200


def test_missing_config_file_uses_defaults(monkeypatch, tmp_path):
    from app.main import settings

    monkeypatch.setattr(settings, "config_file", str(tmp_path / "nope.yaml"))
    with TestClient(app) as c:
        assert c.get("/config").json()["source"].startswith("defaults")
        assert c.get("/readyz").status_code == 200


def test_invalid_config_file_fails_readiness(monkeypatch, tmp_path):
    from app.main import settings

    f = tmp_path / "app.yaml"
    f.write_text("- just\n- a list\n")
    monkeypatch.setattr(settings, "config_file", str(f))
    with TestClient(app) as c:
        assert c.get("/readyz").status_code == 503
        assert c.get("/healthz").status_code == 200
