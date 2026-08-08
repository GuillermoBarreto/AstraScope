from fastapi.testclient import TestClient

from backend.app.models.impact import NearEarthObject
from backend.app.services.fireball_service import normalize_fireball
from backend.app.services.neo_service import normalize_neo
import backend.app.api.impact as impact_api
from backend.main import app


def neo_payload(hazardous: bool = True) -> dict:
    return {
        "id": "3542519", "name": "(2010 PK9)", "nasa_jpl_url": "https://example.test/neo",
        "is_potentially_hazardous_asteroid": hazardous,
        "estimated_diameter": {"kilometers": {"estimated_diameter_min": 0.1, "estimated_diameter_max": 0.2}},
        "close_approach_data": [{"close_approach_date": "2026-08-08", "close_approach_date_full": "2026-Aug-08 12:00", "relative_velocity": {"kilometers_per_second": "12.5"}, "miss_distance": {"kilometers": "384400", "lunar": "1.0"}, "orbiting_body": "Earth"}],
    }


def test_neo_normalization() -> None:
    item = normalize_neo(neo_payload())
    assert item is not None
    assert item.estimatedDiameterMaxKm == 0.2
    assert item.relativeVelocityKmS == 12.5
    assert item.potentiallyHazardous is True


def test_hazardous_filtering(monkeypatch) -> None:
    items = [normalize_neo(neo_payload(True)), normalize_neo({**neo_payload(False), "id": "safe"})]
    monkeypatch.setattr(impact_api, "fetch_neos", lambda *_args: items)
    response = TestClient(app).get("/impact/neos?hazardous=true")
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["neos"][0]["potentiallyHazardous"] is True


def test_fireball_normalization() -> None:
    fields = ["date", "lat", "lat-dir", "lon", "lon-dir", "alt", "energy", "impact-e", "vx", "vy", "vz"]
    item = normalize_fireball(fields, ["2026-08-01 01:02:03", "10", "S", "20", "W", "30", "2.5", "0.1", "3", "4", "0"])
    assert item is not None
    assert item.latitude == -10
    assert item.longitude == -20
    assert item.velocityKmS == 5


def test_upstream_failure_returns_structured_error(monkeypatch) -> None:
    monkeypatch.setattr(impact_api, "fetch_neos", lambda *_args: (_ for _ in ()).throw(TimeoutError("timed out")))
    payload = TestClient(app).get("/api/impact/neos").json()
    assert payload["neos"] == []
    assert payload["source"] == "unavailable"
    assert payload["error"]["code"] == "UPSTREAM_UNAVAILABLE"


def test_impact_parameter_validation() -> None:
    assert TestClient(app).get("/impact/neos?days=8").status_code == 422
    assert TestClient(app).get("/impact/fireballs?days=0").status_code == 422
