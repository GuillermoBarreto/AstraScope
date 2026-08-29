import json
import time

from fastapi.testclient import TestClient

import backend.main as main
from backend.main import api_root, health_check, identify_operator, identify_purpose, normalize, normalize_satcat, normalize_satnogs, object_type, operational_status, orbit_class
from backend.app.data.satellite_metadata import curated_metadata
from backend.app.core.config import Settings


ISS = {
    "tle0": "ISS (ZARYA)",
    "tle1": "1 25544U 98067A   26214.50635181  .00006342  00000-0  12183-3 0  9997",
    "tle2": "2 25544  51.6315  70.8679 0007172   4.7554 355.3502 15.49313226578933",
    "norad_cat_id": 25544,
}


def test_normalize_satnogs_tle() -> None:
    satellite = normalize_satnogs(ISS)
    assert satellite["noradId"] == 25544
    assert satellite["objectId"] == "1998-067A"
    assert satellite["orbit"] == "LEO"
    assert satellite["purpose"] == "Crewed station"
    assert satellite["tle1"].startswith("1 25544")
    assert satellite["dataSources"]["orbit"] == "satnogs"


def satcat_record(**overrides):
    record = {
        "OBJECT_NAME": "ISS (ZARYA)",
        "OBJECT_ID": "1998-067A",
        "NORAD_CAT_ID": "25544",
        "OBJECT_TYPE": "PAY",
        "OPS_STATUS_CODE": "+",
        "OWNER": "US",
        "LAUNCH_DATE": "1998-11-20",
        "LAUNCH_SITE": "TTMTR",
        "DECAY_DATE": "",
        "PERIOD": "92.9",
        "INCLINATION": "51.64",
        "APOGEE": "423",
        "PERIGEE": "416",
        "RCS": "399.05",
        "DATA_STATUS_CODE": "",
    }
    record.update(overrides)
    return record


def test_normalize_celestrak_satcat_with_provenance() -> None:
    item = normalize_satcat(satcat_record())
    assert item["noradId"] == 25544
    assert item["internationalDesignator"] == "1998-067A"
    assert item["objectType"] == "PAYLOAD"
    assert item["operationalStatus"] == "ACTIVE"
    assert item["dataSources"] == {"catalog": "celestrak-satcat"}


def test_object_type_and_status_classification() -> None:
    assert object_type("PAY") == "PAYLOAD"
    assert object_type("R/B") == "ROCKET_BODY"
    assert object_type("DEB") == "DEBRIS"
    assert object_type("something new") == "UNKNOWN"
    assert operational_status("-") == "INACTIVE"
    assert operational_status("+", "2020-01-01") == "DECAYED"


def test_gp_normalization_preserves_six_digit_norad_id_and_source() -> None:
    item = normalize({
        "OBJECT_NAME": "SARAMAGO",
        "OBJECT_ID": "2026-999A",
        "NORAD_CAT_ID": 100123,
        "EPOCH": "2026-08-01T00:00:00Z",
        "MEAN_MOTION": 15.1,
        "OBJECT_TYPE": "PAYLOAD",
    }, "space-track")
    assert item["noradId"] == 100123
    assert item["dataSources"]["orbit"] == "space-track"


def test_metadata_without_current_elements_is_not_propagable() -> None:
    item = normalize_satcat(satcat_record(DATA_STATUS_CODE="NCE", PERIOD=""))
    assert item["hasOrbitalData"] is False
    assert item["orbitalPeriodMinutes"] is None


def test_catalog_deduplication_identity_is_norad_not_name() -> None:
    records = [normalize_satcat(satcat_record()), normalize_satcat(satcat_record(NORAD_CAT_ID="99999"))]
    assert len({item["noradId"] for item in records}) == 2


def test_catalog_search_and_filters_use_supported_metadata() -> None:
    records = [
        normalize_satcat(satcat_record()),
        normalize_satcat(satcat_record(OBJECT_NAME="TEST R/B", OBJECT_ID="2020-001B", NORAD_CAT_ID="45000", OBJECT_TYPE="R/B", OPS_STATUS_CODE="-")),
    ]
    assert main.filter_catalog_objects(records, mode="all", search="1998-067A")[0]["noradId"] == 25544
    assert main.filter_catalog_objects(records, mode="all", object_type_filter="ROCKET_BODY")[0]["noradId"] == 45000


def test_catalog_pagination_and_page_size_validation(monkeypatch) -> None:
    records = [normalize_satcat(satcat_record(NORAD_CAT_ID=str(1000 + index), OBJECT_NAME=f"OBJECT {index}")) for index in range(5)]
    monkeypatch.setattr(main, "public_catalog", lambda: (records, "2026-08-29T00:00:00Z", "cache", None))
    client = TestClient(main.app)
    response = client.get("/catalog/objects?page=2&page_size=2")
    assert response.status_code == 200
    assert [item["noradId"] for item in response.json()["objects"]] == [1002, 1003]
    assert client.get("/catalog/objects?page_size=501").status_code == 422


def test_catalog_summary_uses_real_record_classifications(monkeypatch) -> None:
    records = [
        normalize_satcat(satcat_record()),
        normalize_satcat(satcat_record(NORAD_CAT_ID="2", OBJECT_TYPE="R/B", OPS_STATUS_CODE="-")),
        normalize_satcat(satcat_record(NORAD_CAT_ID="3", OBJECT_TYPE="DEB", OPS_STATUS_CODE="?")),
    ]
    monkeypatch.setattr(main, "public_catalog", lambda: (records, "now", "cache", None))
    counts = main.catalog_summary()["counts"]
    assert counts["activePayloads"] == 1
    assert counts["rocketBodies"] == 1
    assert counts["debris"] == 1


def test_public_catalog_persistent_fallback(tmp_path, monkeypatch) -> None:
    cache_file = tmp_path / "public-catalog.json"
    monkeypatch.setattr(main, "PUBLIC_CATALOG_CACHE_FILE", cache_file)
    expected = [normalize_satcat(satcat_record())]
    main.write_public_catalog_cache(expected, "2026-08-29T00:00:00+00:00")
    assert main.read_public_catalog_cache() == (expected, "2026-08-29T00:00:00+00:00")


def test_large_catalog_serialization_benchmark() -> None:
    fixture = [normalize_satcat(satcat_record(NORAD_CAT_ID=str(index + 1), OBJECT_NAME=f"OBJECT {index}")) for index in range(35_000)]
    started = time.perf_counter()
    payload = json.dumps({"objects": fixture}, separators=(",", ":"))
    elapsed = time.perf_counter() - started
    assert len(fixture) == 35_000
    assert len(payload) < 30_000_000
    assert elapsed < 5


def test_catalog_classification() -> None:
    assert identify_operator("STARLINK-1234") == "SpaceX"
    assert identify_purpose("GPS BIIR-5") == "Navigation"
    assert orbit_class(15.5) == "LEO"
    assert orbit_class(2.0) == "MEO"
    assert orbit_class(1.0) == "GEO"


def test_curated_metadata_has_trusted_media_provenance() -> None:
    iss = curated_metadata("ISS (ZARYA)")
    assert iss["description"].startswith("The International Space Station")
    assert iss["imageUrl"].startswith("https://commons.wikimedia.org/")
    assert iss["imageCredit"]
    assert iss["imageSourceUrl"].startswith("https://commons.wikimedia.org/")


def test_unknown_spacecraft_is_not_enriched_with_guesses() -> None:
    assert curated_metadata("UNKNOWN PAYLOAD 42") == {}


def test_api_root_identifies_service() -> None:
    assert api_root() == {"service": "AstraScope API", "status": "online", "docs": "/docs"}


def test_health_check_identifies_service() -> None:
    assert health_check()["service"] == "astrascope-backend"


def test_cors_origins_are_comma_separated() -> None:
    settings = Settings(cors_origins="https://orbiwatch.vercel.app, https://www.guillermobarreto.dev")
    assert settings.cors_origins_list() == [
        "https://orbiwatch.vercel.app",
        "https://www.guillermobarreto.dev",
    ]


def test_disk_cache_preserves_upstream_provenance(tmp_path, monkeypatch) -> None:
    cache_file = tmp_path / "active-satellites.json"
    monkeypatch.setattr(main, "CACHE_FILE", cache_file)

    main.write_disk_cache([{"noradId": 25544}], "2026-08-05T12:00:00+00:00", "celestrak")

    assert main.read_disk_cache() == (
        [{"noradId": 25544}],
        "2026-08-05T12:00:00+00:00",
        "celestrak",
    )


def test_primary_catalog_falls_back_to_celestrak(monkeypatch) -> None:
    class ConfiguredSpaceTrack:
        @staticmethod
        def has_space_track_credentials() -> bool:
            return True

    def fail_spacetrack(_cache_window: int):
        raise ValueError("authentication failed")

    monkeypatch.setattr(main, "settings", ConfiguredSpaceTrack())
    monkeypatch.setattr(main, "fetch_spacetrack_catalog", fail_spacetrack)
    monkeypatch.setattr(main, "fetch_catalog", lambda _cache_window: ([{"noradId": 25544}], "now"))

    assert main.fetch_primary_catalog(1) == ([{"noradId": 25544}], "now", "celestrak")


def test_provider_failure_retry_is_shorter_than_catalog_cache() -> None:
    assert main.FAILURE_RETRY_SECONDS < main.CACHE_SECONDS
    assert main.FAILURE_RETRY_SECONDS == 5 * 60


def test_bulk_celestrak_download_allows_slow_cold_start() -> None:
    assert main.CELESTRAK_TIMEOUT_SECONDS >= 120
