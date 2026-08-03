import json
import re
import ssl
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

import certifi
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

try:
    from app.core.config import settings
except ModuleNotFoundError:  # pragma: no cover - supports direct module execution
    from backend.app.core.config import settings

app = FastAPI(title="OrbitWatch API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json"


@app.get("/health")
@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "orbitwatch-backend", "environment": settings.app_env}


def identify_operator(name: str) -> str:
    upper = name.upper()
    patterns = (
        ("SpaceX", ("STARLINK",)),
        ("Eutelsat OneWeb", ("ONEWEB",)),
        ("Amazon", ("KUIPER",)),
        ("Planet", ("FLOCK", "SKYSAT", "DOVE", "PELICAN")),
        ("Spire", ("LEMUR",)),
        ("Iridium", ("IRIDIUM",)),
        ("Globalstar", ("GLOBALSTAR",)),
        ("SES", ("O3B", "SES-")),
        ("Intelsat", ("INTELSAT",)),
        ("NASA", ("ISS (ZARYA)", "HST", "TERRA", "AQUA", "LANDSAT")),
    )
    return next((operator for operator, tokens in patterns if any(token in upper for token in tokens)), "Other")


def orbit_class(mean_motion: float) -> str:
    if mean_motion >= 11.25:
        return "LEO"
    if mean_motion >= 1.8:
        return "MEO"
    if 0.9 <= mean_motion <= 1.1:
        return "GEO"
    return "HEO"


def normalize(entry: dict[str, Any]) -> dict[str, Any]:
    name = str(entry.get("OBJECT_NAME", "Unknown satellite"))
    norad_id = int(entry.get("NORAD_CAT_ID") or 0)
    mean_motion = float(entry.get("MEAN_MOTION") or 1)
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "satellite"
    return {
        "id": f"{slug}-{norad_id}",
        "name": name,
        "noradId": norad_id,
        "objectId": str(entry.get("OBJECT_ID", "unknown")),
        "epoch": str(entry.get("EPOCH", "")),
        "inclination": float(entry.get("INCLINATION") or 0),
        "raan": float(entry.get("RA_OF_ASC_NODE") or 0),
        "eccentricity": float(entry.get("ECCENTRICITY") or 0),
        "argPericenter": float(entry.get("ARG_OF_PERICENTER") or 0),
        "meanAnomaly": float(entry.get("MEAN_ANOMALY") or 0),
        "meanMotion": mean_motion,
        "operator": identify_operator(name),
        "orbit": orbit_class(mean_motion),
    }


@lru_cache(maxsize=1)
def fetch_catalog(cache_hour: str) -> tuple[list[dict[str, Any]], str]:
    del cache_hour
    request = Request(CELESTRAK_URL, headers={"User-Agent": "OrbitWatch/0.2"})
    tls_context = ssl.create_default_context(cafile=certifi.where())
    with urlopen(request, timeout=30, context=tls_context) as response:
        payload = json.load(response)
    if not isinstance(payload, list):
        return [], datetime.now(timezone.utc).isoformat()
    return [normalize(item) for item in payload if isinstance(item, dict)], datetime.now(timezone.utc).isoformat()


@app.get("/satellites")
@app.get("/api/satellites")
def list_satellites(
    operator: str | None = Query(default=None),
    orbit: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=80),
) -> dict[str, Any]:
    source = "celestrak"
    error = None
    try:
        cache_hour = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")
        satellites, updated_at = fetch_catalog(cache_hour)
    except (URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as exc:
        satellites = []
        updated_at = datetime.now(timezone.utc).isoformat()
        source = "unavailable"
        error = f"{type(exc).__name__}: {exc}"

    if operator and operator.lower() != "all":
        satellites = [item for item in satellites if item["operator"].lower() == operator.lower()]
    if orbit and orbit.lower() != "all":
        satellites = [item for item in satellites if item["orbit"].lower() == orbit.lower()]
    if search:
        query = search.lower()
        satellites = [
            item for item in satellites
            if query in item["name"].lower() or query in str(item["noradId"])
        ]

    return {
        "satellites": satellites,
        "total": len(satellites),
        "updatedAt": updated_at,
        "source": source,
        "error": error,
    }
