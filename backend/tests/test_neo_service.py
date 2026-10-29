"""Tests for neo_service: normalize_neo edge cases and cache key hygiene."""

import pytest

from backend.app.services import neo_service
from backend.app.services.neo_service import normalize_neo


def _payload(**overrides):
    base = {
        "id": "3542519",
        "name": "(2010 PK9)",
        "is_potentially_hazardous_asteroid": False,
        "estimated_diameter": {
            "kilometers": {"estimated_diameter_min": 0.1, "estimated_diameter_max": 0.2}
        },
        "close_approach_data": [{
            "close_approach_date": "2026-08-08",
            "close_approach_date_full": "2026-Aug-08 12:00",
            "relative_velocity": {"kilometers_per_second": "12.5"},
            "miss_distance": {"kilometers": "384400", "lunar": "1.0"},
            "orbiting_body": "Earth",
        }],
    }
    base.update(overrides)
    return base


def test_normalize_neo_rejects_missing_approach_date() -> None:
    payload = _payload()
    del payload["close_approach_data"][0]["close_approach_date"]
    assert normalize_neo(payload) is None


def test_normalize_neo_tolerates_null_nested_objects() -> None:
    payload = _payload()
    payload["estimated_diameter"] = None
    approach = payload["close_approach_data"][0]
    approach["relative_velocity"] = None
    approach["miss_distance"] = None
    item = normalize_neo(payload)
    assert item is not None
    assert item.estimatedDiameterMinKm is None
    assert item.estimatedDiameterMaxKm is None
    assert item.relativeVelocityKmS is None
    assert item.missDistanceKm is None


def test_normalize_neo_id_falls_back_to_reference_id() -> None:
    payload = _payload()
    del payload["id"]
    payload["neo_reference_id"] = "ref-123"
    item = normalize_neo(payload)
    assert item is not None
    assert item.id == "ref-123"


def test_normalize_neo_rejects_non_list_approaches() -> None:
    payload = _payload(close_approach_data="not-a-list")
    assert normalize_neo(payload) is None


def test_key_fingerprint_is_stable_and_hides_the_key() -> None:
    fingerprint = neo_service._key_fingerprint("secret-key")
    assert fingerprint == neo_service._key_fingerprint("secret-key")
    assert "secret-key" not in fingerprint
    assert len(fingerprint) == 64


def test_fetch_neos_detects_key_rotation(monkeypatch) -> None:
    import backend.app.core.config as config_module

    class FakeSettings:
        nasa_api_key = "rotated-key"

    monkeypatch.setattr(config_module, "settings", FakeSettings())
    neo_service._fetch_neos_cached.cache_clear()
    try:
        with pytest.raises(ValueError, match="API key changed"):
            neo_service._fetch_neos_cached(7, neo_service._key_fingerprint("original-key"), 1)
    finally:
        neo_service._fetch_neos_cached.cache_clear()


def test_fetch_neos_rejects_non_dict_payload(monkeypatch) -> None:
    # A non-object NeoWs payload must surface as the structured upstream
    # error, not escape as an AttributeError 500: payload.get() on a list
    # is not one of the exceptions impact.py catches.
    import backend.app.core.config as config_module
    import json

    class FakeSettings:
        nasa_api_key = "test-key"

    class FakeResponse:
        def __init__(self, data):
            self._data = data

        def read(self):
            return self._data

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(config_module, "settings", FakeSettings())
    monkeypatch.setattr(
        neo_service,
        "urlopen",
        lambda *args, **kwargs: FakeResponse(json.dumps(["not", "a", "dict"]).encode()),
    )
    neo_service._fetch_neos_cached.cache_clear()
    try:
        with pytest.raises(ValueError, match="malformed data"):
            neo_service._fetch_neos_cached(7, neo_service._key_fingerprint("test-key"), 1)
    finally:
        neo_service._fetch_neos_cached.cache_clear()


def test_normalize_neo_tolerates_non_dict_nested_objects() -> None:
    # A non-dict truthy value (stray scalar) in a nested object must be
    # treated like null: skipped, not an AttributeError escaping as an
    # unhandled 500 for the whole feed.
    payload = _payload()
    payload["estimated_diameter"] = "n/a"
    approach = payload["close_approach_data"][0]
    approach["relative_velocity"] = "n/a"
    approach["miss_distance"] = ["not", "a", "dict"]
    item = normalize_neo(payload)
    assert item is not None
    assert item.estimatedDiameterMinKm is None
    assert item.estimatedDiameterMaxKm is None
    assert item.relativeVelocityKmS is None
    assert item.missDistanceKm is None


def test_normalize_neo_coerces_non_string_fields_to_none() -> None:
    # Non-string values in string fields must not escape as ValidationError
    # and drop the whole feed: they are treated as absent and the record
    # survives.
    payload = _payload()
    payload["nasa_jpl_url"] = ["not", "a", "url"]
    approach = payload["close_approach_data"][0]
    approach["orbiting_body"] = {"body": "Earth"}
    approach["close_approach_date_full"] = 20260808
    item = normalize_neo(payload)
    assert item is not None
    assert item.nasaJplUrl is None
    assert item.orbitingBody is None
    assert item.closeApproachDateTime is None


def test_optional_str_keeps_strings_and_drops_other_types() -> None:
    from backend.app.core.parsing import optional_str
    assert optional_str("Earth") == "Earth"
    assert optional_str(None) is None
    assert optional_str(123) is None
    assert optional_str(["x"]) is None


def test_optional_float_rejects_booleans() -> None:
    # float(True) is 1.0, so without an explicit guard a JSON true in a
    # numeric upstream field would silently parse as 1.0 instead of being
    # treated as malformed input.
    from backend.app.core.parsing import optional_float
    assert optional_float(True) is None
    assert optional_float(False) is None
    assert optional_float("2.5") == 2.5
    assert optional_float(0) == 0.0
    assert optional_float(None) is None
    assert optional_float("") is None
    assert optional_float("nan") is None
    assert optional_float(float("inf")) is None


def test_normalize_neo_treats_non_string_id_and_name_as_absent() -> None:
    # Issue #69, continued: a dict id / list name used to be str()-coerced
    # into garbage ("{...}") instead of treated as absent, so the fallback
    # chain never ran. Non-string ids fall back to the reference id, then
    # the name, then the approach date; a non-string name falls back to
    # "Unnamed object".
    payload = _payload(id={"not": "an id"}, neo_reference_id=12345, name=["weird"])
    item = normalize_neo(payload)
    assert item is not None
    assert item.id == "2026-08-08"
    assert item.name == "Unnamed object"
    payload = _payload(id=["nope"], neo_reference_id="ref-9", name="(2010 PK9)")
    item = normalize_neo(payload)
    assert item is not None
    assert item.id == "ref-9"
