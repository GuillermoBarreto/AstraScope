import json

from fastapi.testclient import TestClient

from backend.app.models.impact import NearEarthObject
from backend.app.services.fireball_service import normalize_fireball
import backend.app.services.fireball_service as fireball_service
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


def test_fireball_normalization_signed_coordinates() -> None:
    fields = ["date", "lat", "lat-dir", "lon", "lon-dir", "alt", "energy", "impact-e", "vx", "vy", "vz"]
    # JPL sometimes returns already-signed values alongside the direction
    # flag; the flag must win instead of flipping into the wrong hemisphere.
    item = normalize_fireball(fields, ["2026-08-01 01:02:03", "-10", "S", "-20", "W", "30", "2.5", "0.1", "3", "4", "0"])
    assert item is not None
    assert item.latitude == -10
    assert item.longitude == -20
    assert "S" in (item.locationDescription or "")
    assert "W" in (item.locationDescription or "")


def test_upstream_failure_returns_structured_error(monkeypatch) -> None:
    monkeypatch.setattr(impact_api, "fetch_neos", lambda *_args: (_ for _ in ()).throw(TimeoutError("timed out")))
    payload = TestClient(app).get("/api/impact/neos").json()
    assert payload["neos"] == []
    assert payload["source"] == "unavailable"
    assert payload["error"]["code"] == "UPSTREAM_UNAVAILABLE"


def test_impact_parameter_validation() -> None:
    assert TestClient(app).get("/impact/neos?days=8").status_code == 422
    assert TestClient(app).get("/impact/fireballs?days=0").status_code == 422


def test_fireball_normalization_rejects_incomplete_rows() -> None:
    fields = ["date", "lat", "lat-dir", "lon", "lon-dir", "alt", "energy", "impact-e", "vx", "vy", "vz"]
    # missing energy -> rejected
    assert normalize_fireball(fields, ["2026-08-01 01:02:03", "10", "N", "20", "E", "30", "", "0.1", "3", "4", "0"]) is None
    # missing impact energy -> rejected
    assert normalize_fireball(fields, ["2026-08-01 01:02:03", "10", "N", "20", "E", "30", "2.5", "", "3", "4", "0"]) is None
    # missing timestamp -> rejected
    assert normalize_fireball(fields, ["", "10", "N", "20", "E", "30", "2.5", "0.1", "3", "4", "0"]) is None


def test_neo_normalization_rejects_missing_approach() -> None:
    assert normalize_neo({"id": "1", "name": "NoApproach"}) is None
    assert normalize_neo({**neo_payload(), "close_approach_data": []}) is None


def test_neo_normalization_tolerates_null_nested_objects() -> None:
    payload = neo_payload()
    payload["estimated_diameter"] = None
    payload["close_approach_data"] = [{
        "close_approach_date": "2026-08-08",
        "relative_velocity": None,
        "miss_distance": None,
    }]
    item = normalize_neo(payload)
    assert item is not None
    assert item.estimatedDiameterMinKm is None
    assert item.estimatedDiameterMaxKm is None
    assert item.relativeVelocityKmS is None
    assert item.missDistanceKm is None


def test_neo_normalization_falls_back_to_name_for_id() -> None:
    payload = neo_payload()
    del payload["id"]
    item = normalize_neo(payload)
    assert item is not None
    assert item.id == "(2010 PK9)"


class _FakeJsonResponse:
    def __init__(self, body: bytes):
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args) -> bool:
        return False


def _fireball_payload(count):
    return {
        "count": count,
        "fields": ["date", "energy", "impact-e"],
        "data": [["2026-08-01 01:02:03", "2.5", "0.1"]],
    }


def test_fireball_malformed_count_returns_structured_error(monkeypatch) -> None:
    # A non-numeric JPL "count" is malformed data: it must surface as the
    # generic upstream error, not leak out as an unhandled 500.
    monkeypatch.setattr(
        fireball_service,
        "urlopen",
        lambda *args, **kwargs: _FakeJsonResponse(json.dumps(_fireball_payload("many")).encode()),
    )
    fireball_service._fetch_fireballs_cached.cache_clear()
    body = TestClient(app).get("/api/impact/fireballs?days=31").json()
    assert body["fireballs"] == []
    assert body["source"] == "unavailable"
    assert body["error"]["code"] == "UPSTREAM_UNAVAILABLE"


def test_fireball_zero_count_returns_empty_without_error(monkeypatch) -> None:
    monkeypatch.setattr(
        fireball_service,
        "urlopen",
        lambda *args, **kwargs: _FakeJsonResponse(json.dumps(_fireball_payload(0)).encode()),
    )
    fireball_service._fetch_fireballs_cached.cache_clear()
    body = TestClient(app).get("/api/impact/fireballs?days=32").json()
    assert body["fireballs"] == []
    assert body["source"] == "live-or-cache"
    assert body["error"] is None


def test_fireball_days_clamped_before_cache_key(monkeypatch) -> None:
    # days=0 and days=1 request the same upstream range, so they must share a
    # single lru_cache entry instead of issuing duplicate upstream calls.
    calls = []

    def fake_urlopen(*args, **kwargs):
        calls.append(args)
        return _FakeJsonResponse(json.dumps(_fireball_payload(1)).encode())

    monkeypatch.setattr(fireball_service, "urlopen", fake_urlopen)
    fireball_service._fetch_fireballs_cached.cache_clear()
    first = fireball_service.fetch_fireballs(0, 12345)
    second = fireball_service.fetch_fireballs(1, 12345)
    assert first == second
    assert len(first) == 1
    assert len(calls) == 1


def test_fireball_non_dict_payload_returns_structured_error(monkeypatch) -> None:
    # A non-object JPL payload is malformed data: it must surface as the
    # generic upstream error, not as a successful sync with zero fireballs.
    monkeypatch.setattr(
        fireball_service,
        "urlopen",
        lambda *args, **kwargs: _FakeJsonResponse(json.dumps(["not", "a", "dict"]).encode()),
    )
    fireball_service._fetch_fireballs_cached.cache_clear()
    body = TestClient(app).get("/api/impact/fireballs?days=33").json()
    assert body["fireballs"] == []
    assert body["source"] == "unavailable"
    assert body["error"]["code"] == "UPSTREAM_UNAVAILABLE"


def test_fireball_normalization_does_not_double_stamp_timezone() -> None:
    fields = ["date", "lat", "lat-dir", "lon", "lon-dir", "alt", "energy", "impact-e", "vx", "vy", "vz"]
    row = ["2026-08-01T01:02:03Z", "10", "N", "20", "E", "30", "2.5", "0.1", "3", "4", "0"]
    item = normalize_fireball(fields, row)
    assert item is not None
    assert item.dateTime == "2026-08-01T01:02:03Z"
    row[0] = "2026-08-01 01:02:03+00:00"
    item = normalize_fireball(fields, row)
    assert item is not None
    assert item.dateTime == "2026-08-01T01:02:03+00:00"
    row[0] = "2026-08-01 01:02:03"
    item = normalize_fireball(fields, row)
    assert item is not None
    assert item.dateTime == "2026-08-01T01:02:03Z"
