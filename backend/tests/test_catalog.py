from backend.main import identify_operator, identify_purpose, normalize_satnogs, orbit_class


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
