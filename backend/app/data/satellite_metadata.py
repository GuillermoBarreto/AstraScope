"""Small, curated spacecraft metadata set.

Images use Wikimedia Commons' stable file redirect service. Each record includes a
source page so the UI can expose provenance instead of guessing imagery by name.
"""

from typing import Any


METADATA_RULES: tuple[tuple[tuple[str, ...], dict[str, Any]], ...] = (
    (("ISS", "ISS (ZARYA)"), {
        "operator": "NASA / Roscosmos and partners",
        "description": "The International Space Station is a crewed research laboratory in low Earth orbit.",
        "launchDate": "1998-11-20",
        "launchVehicle": "Proton-K and Space Shuttle assembly flights",
        "launchSite": "Baikonur Cosmodrome",
        "imageUrl": "https://commons.wikimedia.org/wiki/Special:Redirect/file/International%20Space%20Station%20after%20undocking%20of%20STS-132.jpg",
        "imageAlt": "The International Space Station above Earth",
        "imageCredit": "NASA, via Wikimedia Commons",
        "imageSourceUrl": "https://commons.wikimedia.org/wiki/File:International_Space_Station_after_undocking_of_STS-132.jpg",
        "sourceUrl": "https://www.nasa.gov/international-space-station/",
    }),
    (("HST", "HUBBLE"), {
        "description": "The Hubble Space Telescope is a NASA and ESA observatory studying the universe from low Earth orbit.",
        "launchDate": "1990-04-24",
        "launchVehicle": "Space Shuttle Discovery (STS-31)",
        "launchSite": "Kennedy Space Center",
        "imageUrl": "https://commons.wikimedia.org/wiki/Special:Redirect/file/Hubble%2001.jpg",
        "imageAlt": "Hubble Space Telescope in orbit",
        "imageCredit": "NASA, via Wikimedia Commons",
        "imageSourceUrl": "https://commons.wikimedia.org/wiki/File:Hubble_01.jpg",
        "sourceUrl": "https://science.nasa.gov/mission/hubble/",
    }),
    (("LANDSAT",), {
        "description": "Landsat spacecraft provide a long-running record of changes to Earth's land surface.",
        "sourceUrl": "https://landsat.gsfc.nasa.gov/",
    }),
    (("NOAA", "GOES"), {
        "description": "NOAA spacecraft support weather forecasting and observations of Earth's atmosphere and environment.",
        "sourceUrl": "https://www.nesdis.noaa.gov/current-satellites",
    }),
    (("GPS", "NAVSTAR"), {
        "description": "GPS spacecraft broadcast timing and navigation signals from medium Earth orbit.",
        "sourceUrl": "https://www.gps.gov/systems/gps/space/",
    }),
    (("STARLINK",), {
        "description": "Starlink satellites provide broadband internet as part of SpaceX's low-Earth-orbit constellation.",
        "sourceUrl": "https://www.starlink.com/technology",
    }),
    (("SENTINEL",), {
        "description": "Sentinel spacecraft collect Earth-observation data for the European Copernicus programme.",
        "sourceUrl": "https://www.esa.int/Applications/Observing_the_Earth/Copernicus/The_Sentinel_missions",
    }),
)


def curated_metadata(name: str) -> dict[str, Any]:
    upper = name.upper()
    for tokens, metadata in METADATA_RULES:
        if any(upper == token or upper.startswith(f"{token}-") or token in upper for token in tokens):
            return dict(metadata)
    return {}


def enrich_satellite(record: dict[str, Any]) -> dict[str, Any]:
    return {**record, **curated_metadata(str(record.get("name", "")))}
