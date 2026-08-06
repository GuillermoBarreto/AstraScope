import backend.main as main
from backend.main import api_root, identify_operator, identify_purpose, normalize_satnogs, orbit_class
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


def test_catalog_classification() -> None:
    assert identify_operator("STARLINK-1234") == "SpaceX"
    assert identify_purpose("GPS BIIR-5") == "Navigation"
    assert orbit_class(15.5) == "LEO"
    assert orbit_class(2.0) == "MEO"
    assert orbit_class(1.0) == "GEO"


def test_api_root_identifies_service() -> None:
    assert api_root() == {"service": "OrbiWatch API", "status": "online", "docs": "/docs"}


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
