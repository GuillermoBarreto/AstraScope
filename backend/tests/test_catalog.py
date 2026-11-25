import csv
import io
import json
import sys
import time
from urllib.error import URLError

import pytest

from fastapi.testclient import TestClient

import backend.main as main
from backend.main import api_root, health_check, identify_operator, identify_purpose, normalize, normalize_satcat, normalize_satnogs, object_type, operational_status, orbit_class, tle_epoch, tle_object_id
from backend.app.data.satellite_metadata import curated_metadata
from backend.app.core.config import Settings


ISS = {
    "tle0": "ISS (ZARYA)",
    "tle1": "1 25544U 98067A   26214.50635181  .00006342  00000-0  12183-3 0  9997",
    "tle2": "2 25544  51.6315  70.8679 0007172   4.7554 355.3502 15.49313226578933",
    "norad_cat_id": 25544,
}


def test_tle_year_pivot_boundary() -> None:
    # The two-digit-year pivot lives in one constant: years below 57 belong
    # to the 2000s, 57 and above to the 1900s, in both tle_epoch and
    # tle_object_id.
    epoch_56 = tle_epoch("56214.5")
    assert epoch_56.startswith("2056-")
    epoch_57 = tle_epoch("57214.5")
    assert epoch_57.startswith("1957-")
    assert tle_object_id("56067A") == "2056-067A"
    assert tle_object_id("98067A") == "1998-067A"


def test_tle_epoch_rejects_impossible_day() -> None:
    # A huge day-of-year used to raise OSError (not ValueError) and kill
    # the whole SatNOGS sync instead of skipping that one record; a
    # negative one silently produced a plausible-looking prior-year date.
    with pytest.raises(ValueError):
        tle_epoch("26999999999999")
    with pytest.raises(ValueError):
        tle_epoch("26-05.5")
    assert tle_epoch("26001.5").startswith("2026-01-01")


def test_tle_epoch_rejects_day_366_in_a_non_leap_year() -> None:
    # 2026 has 365 days: day 366 used to roll into 2027-01-01 instead of
    # being rejected, stamping the record with the wrong year.
    with pytest.raises(ValueError):
        tle_epoch("26366.5")
    assert tle_epoch("24366.5").startswith("2024-12-31")
    assert tle_epoch("26365.5").startswith("2026-12-31")


def test_normalize_satnogs_tle() -> None:
    satellite = normalize_satnogs(ISS)
    assert satellite["noradId"] == 25544
    assert satellite["objectId"] == "1998-067A"
    assert satellite["orbit"] == "LEO"
    assert satellite["purpose"] == "Crewed station"
    assert satellite["tle1"].startswith("1 25544")
    assert satellite["dataSources"]["orbit"] == "satnogs"


def test_normalize_satnogs_treats_non_string_name_as_absent() -> None:
    # a dict tle0 used to become a "{...}" literal satellite name; a
    # wrong-typed value is absent, like the GP/satcat normalizers do
    satellite = normalize_satnogs({**ISS, "tle0": {"name": "ISS"}})
    assert satellite["name"] == "Unknown satellite"


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


def test_normalize_satcat_treats_non_string_fields_as_absent() -> None:
    # Same family as the GP normalizer: a dict OBJECT_NAME used to be
    # str()-coerced into a catalog entry literally named
    # "{'weird': 'dict'}", and a list OWNER into "['US']". Non-string
    # values are absent, not coerced, so the record keeps its fallbacks.
    item = normalize_satcat(satcat_record(
        OBJECT_NAME={"weird": "dict"},
        OBJECT_ID=["1998-067A"],
        OWNER=["US"],
        LAUNCH_DATE={"date": "1998-11-20"},
        LAUNCH_SITE=12345,
        DECAY_DATE=["2020-01-01"],
        DATA_STATUS_CODE={"code": "x"},
    ))
    assert item["name"] == "Unknown object"
    assert item["internationalDesignator"] is None
    assert item["countryCode"] is None
    assert item["owner"] is None
    assert item["launchDate"] is None
    assert item["launchSite"] is None
    assert item["decayDate"] is None
    assert item["dataStatus"] is None
    assert item["operationalStatus"] == "ACTIVE"


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


def test_satellites_search_ignores_surrounding_whitespace(monkeypatch) -> None:
    # A search pasted with surrounding spaces (" iss ") found nothing on
    # /satellites while /catalog/search strips the query first. Strip it
    # here too so both endpoints agree.
    from datetime import datetime, timezone
    fresh_stamp = datetime.now(timezone.utc).isoformat()
    monkeypatch.setattr(
        main, "read_disk_cache",
        lambda: ([normalize_satcat(satcat_record())], fresh_stamp, "celestrak"),
    )
    monkeypatch.setattr(main, "last_failure_at", 0.0)

    response = main.list_satellites(operator=None, orbit=None, search=" iss ")

    assert response["total"] == 1
    assert response["satellites"][0]["noradId"] == 25544


def test_satellites_search_casefolds_names(monkeypatch) -> None:
    # Issue #106: the query was casefolded but the name side used
    # .lower(), so "STRASSE" never matched a satellite named "Straße"
    # ("ß".casefold() == "ss", while "ß".lower() == "ß").
    from datetime import datetime, timezone
    fresh_stamp = datetime.now(timezone.utc).isoformat()
    monkeypatch.setattr(
        main, "read_disk_cache",
        lambda: ([normalize_satcat(satcat_record(OBJECT_NAME="Straße-1"))],
                 fresh_stamp, "celestrak"),
    )
    monkeypatch.setattr(main, "last_failure_at", 0.0)

    response = main.list_satellites(operator=None, orbit=None, search="STRASSE")

    assert response["total"] == 1
    assert response["satellites"][0]["name"] == "Straße-1"


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


def test_public_catalog_cache_rejects_non_dict_entries(tmp_path, monkeypatch) -> None:
    # A hand-seeded or corrupt cache with a non-dict entry must read as a
    # miss, not hand the catalog endpoints a record they can't index.
    cache_file = tmp_path / "public-catalog.json"
    monkeypatch.setattr(main, "PUBLIC_CATALOG_CACHE_FILE", cache_file)
    cache_file.write_text(json.dumps({"objects": [{"noradId": 25544}, "not-a-record"], "updatedAt": "2026-08-29T00:00:00+00:00"}), encoding="utf-8")
    assert main.read_public_catalog_cache() is None


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


def test_identify_purpose_iss_needs_a_whole_word() -> None:
    # The substring check used to tag any name containing "ISS" as a
    # crewed station — "MISSION-1" and "DISMISS" included.
    assert identify_purpose("ISS (ZARYA)") == "Crewed station"
    assert identify_purpose("ISS DEB") == "Crewed station"
    assert identify_purpose("MISSION-1") == "Other"
    assert identify_purpose("DISMISS") == "Other"


def test_identify_purpose_gps_needs_a_whole_word() -> None:
    # Issue #108: the substring check tagged "GPSAT-1" as Navigation
    # ("GPS" inside "GPSAT"). Every pattern token must match as a whole
    # word now, like ISS already did — hyphenated and spaced spellings
    # still match, embedded ones don't.
    assert identify_purpose("GPSAT-1") == "Other"
    assert identify_purpose("GPS BIIR-5") == "Navigation"
    assert identify_purpose("GPS IIF-1") == "Navigation"
    assert identify_purpose("SES-1") == "Communications"
    assert identify_purpose("O3B FM1") == "Communications"
    assert identify_purpose("STARLINK-1234") == "Broadband"
    assert identify_purpose("GOES-16") == "Weather"
    assert identify_purpose("LANDSAT 8") == "Earth observation"
    assert identify_purpose("CSS (TIANHE)") == "Crewed station"
    assert identify_purpose("TIANHE") == "Crewed station"


def test_curated_metadata_has_trusted_media_provenance() -> None:
    iss = curated_metadata("ISS (ZARYA)")
    assert iss["description"].startswith("The International Space Station")
    assert iss["imageUrl"].startswith("https://commons.wikimedia.org/")
    assert iss["imageCredit"]
    assert iss["imageSourceUrl"].startswith("https://commons.wikimedia.org/")


def test_curated_metadata_matches_whole_words_only() -> None:
    # Issue #45: the substring check handed ISS metadata to any name
    # containing "ISS" — "DISMISS" and "MISSION-1" included. Tokens must
    # match as whole words, like identify_purpose already does.
    assert curated_metadata("DISMISS") == {}
    assert curated_metadata("MISSION-1") == {}
    assert curated_metadata("STARLINK-1007")["description"].startswith("Starlink satellites")
    assert curated_metadata("GOES-16")["description"].startswith("NOAA spacecraft")
    assert curated_metadata("LANDSAT 8")["description"].startswith("Landsat spacecraft")
    assert curated_metadata("SENTINEL-1A")["description"].startswith("Sentinel spacecraft")
    assert curated_metadata("NOAA 19")["description"].startswith("NOAA spacecraft")
    assert curated_metadata("GPS BIIR-5")["description"].startswith("GPS spacecraft")
    assert curated_metadata("HUBBLE SPACE TELESCOPE")["description"].startswith("The Hubble Space Telescope")


def test_unknown_spacecraft_is_not_enriched_with_guesses() -> None:
    assert curated_metadata("UNKNOWN PAYLOAD 42") == {}


def test_api_root_identifies_service() -> None:
    assert api_root() == {"service": "AstraScope API", "status": "online", "docs": "/docs"}


def test_health_check_identifies_service() -> None:
    assert health_check()["service"] == "astrascope-backend"


def test_main_uses_the_canonical_impact_module() -> None:
    # Issue #88: main.py used to try the top-level `app` package first,
    # so running pytest from backend/ loaded a second copy of the impact
    # module and the tests' monkeypatches missed it — the endpoints hit
    # live upstream data instead of the fakes. The canonical backend.app
    # copy must be the one main uses, and no second copy may load.
    import backend.app.api.impact as impact_api

    assert main.impact_router is impact_api.router
    assert "app.api.impact" not in sys.modules
    assert "app.core.config" not in sys.modules


def test_cors_origins_are_comma_separated() -> None:
    settings = Settings(cors_origins="https://orbiwatch.vercel.app, https://www.guillermobarreto.dev")
    assert settings.cors_origins_list() == [
        "https://orbiwatch.vercel.app",
        "https://www.guillermobarreto.dev",
    ]


def test_disk_cache_preserves_upstream_provenance(tmp_path, monkeypatch) -> None:
    cache_file = tmp_path / "active-satellites.json"
    monkeypatch.setattr(main, "CACHE_FILE", cache_file)

    main.write_disk_cache([{"noradId": 25544, "objectType": "PAYLOAD"}], "2026-08-05T12:00:00+00:00", "celestrak")

    assert main.read_disk_cache() == (
        [{"noradId": 25544, "objectType": "PAYLOAD"}],
        "2026-08-05T12:00:00+00:00",
        "celestrak",
    )


def test_spacetrack_all_malformed_payload_raises_instead_of_caching_empty(monkeypatch, tmp_path) -> None:
    # Issue #65: an all-malformed payload passed the non-empty check, then
    # the per-record loop skipped every record, and the empty list was
    # still written to disk cache labeled "spacetrack". Like the CelesTrak
    # and SatNOGS paths, it must raise so fetch_primary_catalog falls
    # through to the next provider.
    class ConfiguredSpaceTrack:
        space_track_identity = "user"
        space_track_password = "pass"

        @staticmethod
        def has_space_track_credentials() -> bool:
            return True

    class FakeResponse:
        def __init__(self, body: bytes):
            self._body = body

        def read(self) -> bytes:
            return self._body

        def __enter__(self):
            return self

        def __exit__(self, *args) -> bool:
            return False

    class FakeOpener:
        def open(self, request, timeout=None):
            if request.full_url == main.SPACE_TRACK_LOGIN_URL:
                return FakeResponse(b"")
            return FakeResponse(json.dumps([None, "not-a-record", 42]).encode())

    class FullJar:
        # The login check only cares that the jar is non-empty; a real
        # cookie is beside the point for this test.
        def __bool__(self) -> bool:
            return True

    monkeypatch.setattr(main, "settings", ConfiguredSpaceTrack())
    monkeypatch.setattr(main, "CookieJar", FullJar)
    monkeypatch.setattr(main, "build_opener", lambda *args, **kwargs: FakeOpener())
    monkeypatch.setattr(main, "CACHE_FILE", tmp_path / "active-satellites.json")
    main.fetch_spacetrack_catalog.cache_clear()
    try:
        with pytest.raises(ValueError, match="no valid orbital records"):
            main.fetch_spacetrack_catalog(1)
    finally:
        main.fetch_spacetrack_catalog.cache_clear()
    assert not (tmp_path / "active-satellites.json").exists()


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


def test_public_catalog_skips_malformed_rows_individually(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(main, "PUBLIC_CATALOG_CACHE_FILE", tmp_path / "public-catalog.json")
    main.fetch_public_catalog.cache_clear()

    fieldnames = list(satcat_record().keys())
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerow(satcat_record())
    writer.writerow(satcat_record(OBJECT_NAME="BAD ROW", NORAD_CAT_ID="not-a-number"))
    writer.writerow(satcat_record(OBJECT_NAME="OBJECT 2", NORAD_CAT_ID="2"))

    class FakeResponse:
        def __init__(self, body: bytes):
            self._body = body

        def read(self) -> bytes:
            return self._body

        def __enter__(self):
            return self

        def __exit__(self, *args) -> bool:
            return False

    def fake_urlopen(request, timeout=None, context=None):
        assert request.full_url == main.CELESTRAK_SATCAT_URL
        # Include a BOM: real SATCAT downloads decode with utf-8-sig.
        return FakeResponse(("\ufeff" + buffer.getvalue()).encode("utf-8"))

    monkeypatch.setattr(main, "urlopen", fake_urlopen)
    objects, updated_at = main.fetch_public_catalog(1)

    assert [item["noradId"] for item in objects] == [25544, 2]
    assert updated_at


def test_fetch_catalog_rejects_non_list_payload(monkeypatch, tmp_path) -> None:
    # A non-list CelesTrak payload (e.g. an upstream error object) must raise
    # instead of serving an empty sync labeled "celestrak" with no error.
    monkeypatch.setattr(main, "CACHE_FILE", tmp_path / "active-satellites.json")
    main.fetch_catalog.cache_clear()

    class FakeResponse:
        def __init__(self, body: bytes):
            self._body = body

        def read(self) -> bytes:
            return self._body

        def __enter__(self):
            return self

        def __exit__(self, *args) -> bool:
            return False

    monkeypatch.setattr(main, "urlopen", lambda *args, **kwargs: FakeResponse(b'{"error": "upstream busy"}'))
    try:
        with pytest.raises(ValueError, match="invalid catalog"):
            main.fetch_catalog(1)
    finally:
        main.fetch_catalog.cache_clear()


def test_catalog_object_detail_preserves_satcat_identity(monkeypatch) -> None:
    # A GP/orbital record carries no OPS_STATUS_CODE or OBJECT_TYPE columns,
    # so its normalize() defaults ("UNKNOWN" status, "PAYLOAD" type) must not
    # overwrite the SATCAT record's authoritative values in the detail view.
    satcat = normalize_satcat(satcat_record(
        OBJECT_NAME="COSMOS 2251 DEB",
        OBJECT_ID="1993-036BL",
        NORAD_CAT_ID="33777",
        OBJECT_TYPE="DEB",
        OPS_STATUS_CODE="D",
    ))
    orbit = normalize({
        "OBJECT_NAME": "COSMOS 2251 DEB",
        "OBJECT_ID": "1993-036BL",
        "NORAD_CAT_ID": 33777,
        "EPOCH": "2026-10-13T00:00:00Z",
        "MEAN_MOTION": 15.5,
        "INCLINATION": 74.0,
    }, "celestrak-gp")
    monkeypatch.setattr(main, "public_catalog", lambda: ([satcat], "now", "cache", None))
    monkeypatch.setattr(main, "read_disk_cache", lambda: ([orbit], "now", "celestrak"))

    body = main.catalog_object_detail(33777)["object"]

    assert body["id"] == "norad-33777"
    assert body["name"] == "COSMOS 2251 DEB"
    assert body["objectType"] == "DEBRIS"
    assert body["operationalStatus"] == "INACTIVE"
    assert body["launchDate"] == "1998-11-20"
    assert body["hasOrbitalData"] is True
    assert body["meanMotion"] == 15.5
    assert body["epoch"] == "2026-10-13T00:00:00Z"
    assert body["dataSources"] == {"catalog": "celestrak-satcat", "orbit": "celestrak-gp"}


def test_retry_gate_attempts_satnogs_fallback_without_cache(monkeypatch) -> None:
    # Issue #51: the 5-minute retry gate must not suppress the independent
    # SatNOGS fallback when no disk cache exists.
    monkeypatch.setattr(main, "read_disk_cache", lambda: None)
    monkeypatch.setattr(main, "last_failure_at", time.time())
    monkeypatch.setattr(main, "last_failure_error", "Orbital catalog providers are temporarily unavailable")
    monkeypatch.setattr(main, "fetch_satnogs_catalog", lambda _cache_window: ([{"noradId": 25544}], "now"))

    response = main.list_satellites(operator=None, orbit=None, search=None)

    assert response["source"] == "satnogs"
    assert response["upstream"] == "satnogs"
    assert response["total"] == 1


def test_retry_gate_reports_unavailable_when_satnogs_also_fails(monkeypatch) -> None:
    monkeypatch.setattr(main, "read_disk_cache", lambda: None)
    monkeypatch.setattr(main, "last_failure_at", time.time())
    monkeypatch.setattr(main, "last_failure_error", "Orbital catalog providers are temporarily unavailable")

    def fail_satnogs(_cache_window: int):
        raise ValueError("SatNOGS down")

    monkeypatch.setattr(main, "fetch_satnogs_catalog", fail_satnogs)

    response = main.list_satellites(operator=None, orbit=None, search=None)

    assert response["source"] == "unavailable"
    assert response["satellites"] == []
    assert response["total"] == 0


def test_fresh_satnogs_cache_served_as_cache_not_stale(monkeypatch) -> None:
    # A disk cache written minutes ago by the SatNOGS fallback is fresh
    # provider data: it must be served as "cache", not "stale-cache" with the
    # primary's failure error attached.
    from datetime import datetime, timezone
    fresh_stamp = datetime.now(timezone.utc).isoformat()
    monkeypatch.setattr(
        main, "read_disk_cache", lambda: ([{"noradId": 25544}], fresh_stamp, "satnogs")
    )
    monkeypatch.setattr(main, "last_failure_at", 0.0)

    response = main.list_satellites(operator=None, orbit=None, search=None)

    assert response["source"] == "cache"
    assert response["upstream"] == "satnogs"
    assert response["error"] is None
    assert response["total"] == 1


def test_retry_gate_prefers_live_satnogs_over_stale_cache(monkeypatch) -> None:
    # A stale disk cache must not shadow a working SatNOGS fallback: the
    # retry gate suppresses the primary upstream, not the independent
    # fallback (extends #51).
    from datetime import datetime, timedelta, timezone
    stale_stamp = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
    monkeypatch.setattr(
        main, "read_disk_cache", lambda: ([{"noradId": 25544}], stale_stamp, "celestrak")
    )
    monkeypatch.setattr(main, "last_failure_at", time.time())
    monkeypatch.setattr(main, "last_failure_error", "Orbital catalog providers are temporarily unavailable")
    monkeypatch.setattr(main, "fetch_satnogs_catalog", lambda _cache_window: ([{"noradId": 25544}], "now"))

    response = main.list_satellites(operator=None, orbit=None, search=None)

    assert response["source"] == "satnogs"
    assert response["upstream"] == "satnogs"
    # Live fallback data must not be paired with the primary's stale error.
    assert response["error"] is None
    assert response["total"] == 1


def test_retry_gate_serves_stale_cache_when_satnogs_also_fails(monkeypatch) -> None:
    from datetime import datetime, timedelta, timezone
    stale_stamp = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
    monkeypatch.setattr(
        main, "read_disk_cache", lambda: ([{"noradId": 25544}], stale_stamp, "celestrak")
    )
    monkeypatch.setattr(main, "last_failure_at", time.time())
    monkeypatch.setattr(main, "last_failure_error", "Orbital catalog providers are temporarily unavailable")

    def fail_satnogs(_cache_window: int):
        raise ValueError("SatNOGS down")

    monkeypatch.setattr(main, "fetch_satnogs_catalog", fail_satnogs)

    response = main.list_satellites(operator=None, orbit=None, search=None)

    assert response["source"] == "stale-cache"
    assert response["error"] == "Orbital catalog providers are temporarily unavailable"
    assert response["total"] == 1


def test_providers_reports_satnogs_last_success(monkeypatch) -> None:
    # Issue #54: when the disk cache was written by the SatNOGS fallback, the
    # providers endpoint must surface its lastSuccess instead of omitting it.
    stamp = "2026-10-23T12:00:00+00:00"
    monkeypatch.setattr(
        main, "read_disk_cache", lambda: ([{"noradId": 25544}], stamp, "satnogs")
    )
    monkeypatch.setattr(main, "read_public_catalog_cache", lambda: None)

    status = main.catalog_provider_status()

    assert status["satnogs"]["lastSuccess"] == stamp


def test_providers_satnogs_last_success_none_for_other_upstreams(monkeypatch) -> None:
    stamp = "2026-10-23T12:00:00+00:00"
    monkeypatch.setattr(
        main, "read_disk_cache", lambda: ([{"noradId": 25544}], stamp, "spacetrack")
    )
    monkeypatch.setattr(main, "read_public_catalog_cache", lambda: None)

    status = main.catalog_provider_status()

    assert status["satnogs"]["lastSuccess"] is None
    assert status["spaceTrack"]["lastSuccess"] == stamp


def test_providers_celestrak_last_success_compares_instants_not_strings(monkeypatch) -> None:
    # The two caches can carry the same instant spelled differently
    # (hand-seeded files, a -05:00 offset instead of +00:00). max() over
    # the raw strings picks "2026-11-15T19:30:00+00:00" here, but the
    # orbital stamp names 20:00 UTC — half an hour later.
    orbital_stamp = "2026-11-15T15:00:00-05:00"
    catalog_stamp = "2026-11-15T19:30:00+00:00"
    monkeypatch.setattr(
        main, "read_disk_cache", lambda: ([{"noradId": 25544}], orbital_stamp, "celestrak")
    )
    monkeypatch.setattr(
        main, "read_public_catalog_cache", lambda: ([{"noradId": 25544}], catalog_stamp)
    )

    status = main.catalog_provider_status()

    assert status["celestrak"]["lastSuccess"] == orbital_stamp


def test_providers_celestrak_last_success_z_suffix_vs_fractional_seconds(monkeypatch) -> None:
    # Same second, different spellings: "Z" sorts after "." so string max
    # picks the Z stamp, but the fractional-seconds stamp is half a second
    # later.
    orbital_stamp = "2026-11-15T20:00:00Z"
    catalog_stamp = "2026-11-15T20:00:00.500000+00:00"
    monkeypatch.setattr(
        main, "read_disk_cache", lambda: ([{"noradId": 25544}], orbital_stamp, "celestrak")
    )
    monkeypatch.setattr(
        main, "read_public_catalog_cache", lambda: ([{"noradId": 25544}], catalog_stamp)
    )

    status = main.catalog_provider_status()

    assert status["celestrak"]["lastSuccess"] == catalog_stamp


def test_catalog_orbits_does_not_trip_satellites_retry_gate(monkeypatch) -> None:
    # Issue #49: catalog_orbits fans out through list_satellites' fetch path,
    # so a failed upstream sync there must not arm the /satellites retry gate.
    monkeypatch.setattr(main, "read_disk_cache", lambda: None)
    monkeypatch.setattr(main, "last_failure_at", 0.0)

    def fail_primary(_cache_window: int):
        raise URLError("primary down")

    def fail_satnogs(_cache_window: int):
        raise ValueError("SatNOGS down")

    monkeypatch.setattr(main, "fetch_primary_catalog", fail_primary)
    monkeypatch.setattr(main, "fetch_satnogs_catalog", fail_satnogs)
    monkeypatch.setattr(main, "public_catalog", lambda: ([], "now", "cache", None))

    body = main.catalog_orbits()

    assert body["objects"] == []
    assert main.last_failure_at == 0.0


def test_satellites_endpoint_still_trips_retry_gate(monkeypatch) -> None:
    # Control for the #49 fix: the public /satellites endpoint still records
    # its own failures in the retry gate.
    monkeypatch.setattr(main, "read_disk_cache", lambda: None)
    monkeypatch.setattr(main, "last_failure_at", 0.0)

    def fail_primary(_cache_window: int):
        raise URLError("primary down")

    def fail_satnogs(_cache_window: int):
        raise ValueError("SatNOGS down")

    monkeypatch.setattr(main, "fetch_primary_catalog", fail_primary)
    monkeypatch.setattr(main, "fetch_satnogs_catalog", fail_satnogs)

    response = main.list_satellites(operator=None, orbit=None, search=None)

    assert response["source"] == "unavailable"
    assert main.last_failure_at > 0.0


def test_tle_scientific_parses_implied_decimal_exponent() -> None:
    assert main._tle_scientific(" 12183-3") == pytest.approx(1.2183e-4)
    assert main._tle_scientific(" 00000-0") == 0.0
    assert main._tle_scientific("-11606-4") == pytest.approx(-1.1606e-5)
    assert main._tle_scientific("        ") == 0.0
    with pytest.raises(ValueError, match="Invalid SatNOGS TLE record"):
        main._tle_scientific("not-a-field")


def test_normalize_satnogs_parses_tle_drag_terms() -> None:
    # SatNOGS TLE line 1 carries real drag terms; they must not be
    # hardcoded to 0 like before.
    satellite = normalize_satnogs(ISS)
    assert satellite["bstar"] == pytest.approx(1.2183e-4)
    assert satellite["meanMotionDot"] == pytest.approx(6.342e-5)
    assert satellite["meanMotionDdot"] == 0.0


def test_gp_normalization_null_fields_use_fallbacks_not_none_string() -> None:
    # An explicit null used to bypass the missing-key defaults, so a
    # record with OBJECT_NAME null was literally named "None".
    item = normalize({
        "OBJECT_NAME": None,
        "OBJECT_ID": None,
        "NORAD_CAT_ID": 25544,
        "EPOCH": None,
        "COUNTRY_CODE": None,
        "MEAN_MOTION": 15.5,
        "OBJECT_TYPE": "PAYLOAD",
    })
    assert item["name"] == "Unknown satellite"
    assert item["objectId"] == "unknown"
    assert item["epoch"] == ""
    assert item["countryCode"] == "Unknown"
    assert item["orbitalDataUpdatedAt"] == ""
    assert "None" not in item["id"]


def test_gp_normalization_treats_non_string_fields_as_absent() -> None:
    # Same family as the null fallbacks above and issue #69: a dict
    # OBJECT_NAME used to be str()-coerced into a satellite literally
    # named "{'weird': 'dict'}", with a matching garbage slug id, and a
    # list OBJECT_ID became "['x']". Non-string values are absent, not
    # coerced, so the record keeps its fallbacks.
    item = normalize({
        "OBJECT_NAME": {"weird": "dict"},
        "OBJECT_ID": ["x"],
        "NORAD_CAT_ID": 25544,
        "EPOCH": {"epoch": "2026-01-01"},
        "COUNTRY_CODE": ["US"],
        "MEAN_MOTION": 15.5,
        "OBJECT_TYPE": "PAYLOAD",
    })
    assert item["name"] == "Unknown satellite"
    assert item["objectId"] == "unknown"
    assert item["epoch"] == ""
    assert item["countryCode"] == "Unknown"
    assert item["internationalDesignator"] is None
    assert item["orbitalDataUpdatedAt"] == ""
    assert item["id"] == "unknown-satellite-25544"


def test_normalize_rejects_non_finite_and_garbage_floats() -> None:
    # Issue #73: normalize() called float() directly, so "inf"/"nan"
    # sailed into the catalog (breaking JSON output and numeric filters)
    # and a garbage string raised ValueError and dropped the record.
    # All three now mean "no data" and fall back to 0.
    item = normalize({
        "OBJECT_NAME": "BAD FLOATS",
        "OBJECT_ID": "2026-001A",
        "NORAD_CAT_ID": 100001,
        "MEAN_MOTION": "inf",
        "INCLINATION": "nan",
        "ECCENTRICITY": "not-a-number",
        "BSTAR": "1e999",
    })
    assert item["meanMotion"] == 0
    assert item["inclination"] == 0
    assert item["eccentricity"] == 0
    assert item["bstar"] == 0
    assert item["orbit"] == "OTHER"


def test_normalize_falls_back_to_zero_for_garbage_ids() -> None:
    # Issue #75: normalize() called int() directly, so a non-numeric
    # NORAD_CAT_ID raised ValueError and dropped the whole record. It
    # now means "no data" and falls back to 0, like the float fields.
    item = normalize({
        "OBJECT_NAME": "BAD ID",
        "OBJECT_ID": "2026-001A",
        "NORAD_CAT_ID": "ABC",
        "ELEMENT_SET_NO": "not-a-number",
        "MEAN_MOTION": 15.5,
    })
    assert item["noradId"] == 0
    assert item["elementSetNo"] == 0
    assert item["id"] == "bad-id-0"
    satcat = normalize_satcat(satcat_record(NORAD_CAT_ID="ABC"))
    assert satcat["noradId"] == 0


def test_public_catalog_cache_rejects_records_missing_keys(tmp_path, monkeypatch) -> None:
    # Issue #93: a hand-seeded cache record missing the keys the catalog
    # endpoints index (name, objectType, operationalStatus, decayDate)
    # used to 500 every catalog endpoint; it reads as a miss now.
    cache_file = tmp_path / "public-catalog.json"
    monkeypatch.setattr(main, "PUBLIC_CATALOG_CACHE_FILE", cache_file)
    cache_file.write_text(json.dumps({"objects": [{"noradId": 25544, "name": "ISS"}], "updatedAt": "2026-08-29T00:00:00+00:00"}), encoding="utf-8")
    assert main.read_public_catalog_cache() is None


def test_public_catalog_cache_rejects_non_dict_data_sources(tmp_path, monkeypatch) -> None:
    # Same class as issue #93: a record with every indexed key but a
    # string dataSources passed validation, then catalog_object_detail
    # spread it ({**item["dataSources"]}) and 500ed. It reads as a miss
    # now, so public_catalog re-syncs instead of serving a 500.
    cache_file = tmp_path / "public-catalog.json"
    monkeypatch.setattr(main, "PUBLIC_CATALOG_CACHE_FILE", cache_file)
    record = normalize_satcat(satcat_record())
    record["dataSources"] = "celestrak-satcat"
    cache_file.write_text(json.dumps({"objects": [record], "updatedAt": "2026-08-29T00:00:00+00:00"}), encoding="utf-8")
    assert main.read_public_catalog_cache() is None
    record["dataSources"] = {"catalog": "celestrak-satcat"}
    cache_file.write_text(json.dumps({"objects": [record], "updatedAt": "2026-08-29T00:00:00+00:00"}), encoding="utf-8")
    assert main.read_public_catalog_cache() is not None


def test_disk_cache_rejects_records_missing_keys(tmp_path, monkeypatch) -> None:
    # Same class as the public catalog: an orbital record without the
    # noradId/objectType the endpoints index must read as a miss.
    cache_file = tmp_path / "active-satellites.json"
    monkeypatch.setattr(main, "CACHE_FILE", cache_file)
    cache_file.write_text(json.dumps({"schemaVersion": main.CACHE_SCHEMA_VERSION, "satellites": [{"noradId": 25544}], "updatedAt": "2026-08-05T12:00:00+00:00", "upstream": "celestrak"}), encoding="utf-8")
    assert main.read_disk_cache() is None
