import json
import re
import ssl
import time
import csv
import io
from http.cookiejar import CookieJar
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, HTTPSHandler, Request, build_opener, urlopen

import certifi
import truststore
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

try:
    from app.api.impact import router as impact_router
except (ModuleNotFoundError, ImportError):  # pragma: no cover - supports repository-root imports
    from backend.app.api.impact import router as impact_router

try:
    from app.core.config import settings
    from app.data.satellite_metadata import enrich_satellite
except (ModuleNotFoundError, ImportError):  # pragma: no cover - supports direct module execution
    from backend.app.core.config import settings
    from backend.app.data.satellite_metadata import enrich_satellite

app = FastAPI(title="AstraScope API", version="0.2.0")
app.include_router(impact_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json"
CELESTRAK_SATCAT_URL = "https://celestrak.org/pub/satcat.csv"
SATNOGS_URL = "https://db.satnogs.org/api/tle/?format=json"
SPACE_TRACK_LOGIN_URL = "https://www.space-track.org/ajaxauth/login"
SPACE_TRACK_GP_URL = (
    "https://www.space-track.org/basicspacedata/query/class/gp/"
    "decay_date/null-val/epoch/%3Enow-10/orderby/NORAD_CAT_ID/format/json"
)
CACHE_FILE = Path(__file__).resolve().parent / ".cache" / "active-satellites.json"
PUBLIC_CATALOG_CACHE_FILE = Path(__file__).resolve().parent / ".cache" / "public-catalog.json"
CACHE_SECONDS = 2 * 60 * 60
SATCAT_CACHE_SECONDS = 24 * 60 * 60
FAILURE_RETRY_SECONDS = 5 * 60
CELESTRAK_TIMEOUT_SECONDS = 120
CACHE_SCHEMA_VERSION = 4
last_failure_at = 0.0
last_failure_error: str | None = None


def tls_context() -> ssl.SSLContext:
    try:
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except (ImportError, NotImplementedError):
        return ssl.create_default_context(cafile=certifi.where())


@app.get("/health")
@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "astrascope-backend", "environment": settings.app_env}


@app.get("/")
def api_root() -> dict[str, str]:
    return {"service": "AstraScope API", "status": "online", "docs": "/docs"}


def identify_operator(name: str) -> str:
    upper = name.upper()
    if upper in {"ISS", "ISS (ZARYA)", "HST", "TERRA", "AQUA"}:
        return "NASA"
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
        ("NASA", ("LANDSAT",)),
        ("Telesat", ("TELESAT", "LIGHTSPEED")),
        ("ICEYE", ("ICEYE",)),
        ("Capella Space", ("CAPELLA",)),
        ("BlackSky", ("GLOBAL-", "BLACKSKY")),
        ("Maxar", ("WORLDVIEW", "GEOEYE")),
        ("AST SpaceMobile", ("BLUEWALKER", "BLUESAT")),
        ("China SatNet", ("QIANFAN", "GUOWANG")),
    )
    return next((operator for operator, tokens in patterns if any(token in upper for token in tokens)), "Other")


def orbit_class(mean_motion: float) -> str:
    if mean_motion >= 11.25:
        return "LEO"
    if mean_motion >= 1.8:
        return "MEO"
    if 0.9 <= mean_motion <= 1.1:
        return "GEO"
    return "HEO" if mean_motion > 0 else "OTHER"


def object_type(value: Any) -> str:
    normalized = str(value or "").strip().upper().replace(" ", "_")
    return {
        "PAY": "PAYLOAD",
        "PAYLOAD": "PAYLOAD",
        "R/B": "ROCKET_BODY",
        "ROCKET BODY": "ROCKET_BODY",
        "ROCKET_BODY": "ROCKET_BODY",
        "DEB": "DEBRIS",
        "DEBRIS": "DEBRIS",
    }.get(normalized, "UNKNOWN")


def operational_status(code: Any, decay_date: Any = None) -> str:
    if decay_date:
        return "DECAYED"
    normalized = str(code or "").strip().upper()
    if normalized in {"+", "P", "B", "S", "X"}:
        return "ACTIVE"
    if normalized in {"-", "D"}:
        return "INACTIVE"
    return "UNKNOWN"


def identify_purpose(name: str) -> str:
    upper = name.upper()
    patterns = (
        ("Broadband", ("STARLINK", "ONEWEB", "KUIPER")),
        ("Navigation", ("GPS", "GLONASS", "GALILEO", "BEIDOU", "NAVSTAR")),
        ("Weather", ("NOAA", "GOES", "METEOR", "METOP", "HIMAWARI", "FENGYUN")),
        ("Earth observation", ("LANDSAT", "SENTINEL", "FLOCK", "DOVE", "SKYSAT", "TERRA", "AQUA")),
        ("Science", ("HST", "HUBBLE", "JWST", "SWIFT", "TESS", "CHANDRA")),
        ("Communications", ("IRIDIUM", "GLOBALSTAR", "INTELSAT", "SES-", "O3B")),
        ("Crewed station", ("ISS", "TIANHE", "CSS (TIANHE)")),
    )
    return next((purpose for purpose, tokens in patterns if any(token in upper for token in tokens)), "Other")


def normalize(entry: dict[str, Any], orbit_source: str = "celestrak-gp") -> dict[str, Any]:
    name = str(entry.get("OBJECT_NAME", "Unknown satellite"))
    norad_id = int(entry.get("NORAD_CAT_ID") or 0)
    mean_motion = float(entry.get("MEAN_MOTION") or 1)
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "satellite"
    return enrich_satellite({
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
        "bstar": float(entry.get("BSTAR") or 0),
        "meanMotionDot": float(entry.get("MEAN_MOTION_DOT") or 0),
        "meanMotionDdot": float(entry.get("MEAN_MOTION_DDOT") or 0),
        "elementSetNo": int(entry.get("ELEMENT_SET_NO") or 0),
        "operator": identify_operator(name),
        "orbit": orbit_class(mean_motion),
        "purpose": identify_purpose(name),
        "countryCode": str(entry.get("COUNTRY_CODE", "Unknown")),
        "internationalDesignator": str(entry.get("OBJECT_ID") or "") or None,
        "objectType": object_type(entry.get("OBJECT_TYPE", "PAYLOAD")),
        "operationalStatus": operational_status(entry.get("OPS_STATUS_CODE"), entry.get("DECAY_DATE")),
        "hasOrbitalData": True,
        "orbitalDataUpdatedAt": str(entry.get("EPOCH", "")),
        "dataSources": {"orbit": orbit_source},
        "dataQuality": "provider-supplied",
    })


def optional_float(value: Any) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def normalize_satcat(entry: dict[str, Any]) -> dict[str, Any]:
    norad_id = int(entry.get("NORAD_CAT_ID") or 0)
    name = str(entry.get("OBJECT_NAME") or "Unknown object").strip()
    decay_date = str(entry.get("DECAY_DATE") or "").strip() or None
    status = operational_status(entry.get("OPS_STATUS_CODE"), decay_date)
    period = optional_float(entry.get("PERIOD"))
    mean_motion = 1440 / period if period and period > 0 else None
    catalog_type = object_type(entry.get("OBJECT_TYPE"))
    data_status = str(entry.get("DATA_STATUS_CODE") or "").strip() or None
    return {
        "id": f"norad-{norad_id}",
        "noradId": norad_id,
        "name": name,
        "internationalDesignator": str(entry.get("OBJECT_ID") or "").strip() or None,
        "objectType": catalog_type,
        "operationalStatus": status,
        "isActive": status == "ACTIVE",
        "countryCode": str(entry.get("OWNER") or "").strip() or None,
        "owner": str(entry.get("OWNER") or "").strip() or None,
        "launchDate": str(entry.get("LAUNCH_DATE") or "").strip() or None,
        "launchSite": str(entry.get("LAUNCH_SITE") or "").strip() or None,
        "decayDate": decay_date,
        "orbitalPeriodMinutes": period,
        "inclination": optional_float(entry.get("INCLINATION")),
        "apogeeKm": optional_float(entry.get("APOGEE")),
        "perigeeKm": optional_float(entry.get("PERIGEE")),
        "radarCrossSection": optional_float(entry.get("RCS")),
        "orbitClass": orbit_class(mean_motion) if mean_motion else "OTHER",
        # SATCAT metadata can describe an orbit without carrying a current GP
        # element set. Only a GP join may mark a record as propagable.
        "hasOrbitalData": False,
        "dataStatus": data_status,
        "dataSources": {"catalog": "celestrak-satcat"},
        "dataQuality": "provider-supplied",
    }


def tle_epoch(value: str) -> str:
    year = int(value[:2])
    full_year = 2000 + year if year < 57 else 1900 + year
    day = float(value[2:])
    start = datetime(full_year, 1, 1, tzinfo=timezone.utc)
    return datetime.fromtimestamp(start.timestamp() + (day - 1) * 86400, timezone.utc).isoformat()


def tle_object_id(value: str) -> str:
    compact = value.strip()
    if len(compact) < 5:
        return compact or "unknown"
    year = int(compact[:2])
    full_year = 2000 + year if year < 57 else 1900 + year
    return f"{full_year}-{compact[2:5]}{compact[5:]}"


def normalize_satnogs(entry: dict[str, Any]) -> dict[str, Any]:
    line1 = str(entry.get("tle1", ""))
    line2 = str(entry.get("tle2", ""))
    if len(line1) < 32 or len(line2) < 63:
        raise ValueError("Invalid SatNOGS TLE record")
    name = str(entry.get("tle0", "Unknown satellite")).removeprefix("0 ").strip()
    norad_id = int(entry.get("norad_cat_id") or line1[2:7])
    mean_motion = float(line2[52:63])
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "satellite"
    return enrich_satellite({
        "id": f"{slug}-{norad_id}",
        "name": name,
        "noradId": norad_id,
        "objectId": tle_object_id(line1[9:17]),
        "epoch": tle_epoch(line1[18:32]),
        "inclination": float(line2[8:16]),
        "raan": float(line2[17:25]),
        "eccentricity": float(f"0.{line2[26:33].strip()}"),
        "argPericenter": float(line2[34:42]),
        "meanAnomaly": float(line2[43:51]),
        "meanMotion": mean_motion,
        "bstar": 0,
        "meanMotionDot": 0,
        "meanMotionDdot": 0,
        "elementSetNo": int(line1[64:68].strip() or 0),
        "tle1": line1,
        "tle2": line2,
        "operator": identify_operator(name),
        "orbit": orbit_class(mean_motion),
        "purpose": identify_purpose(name),
        "countryCode": "Unknown",
        "objectType": "PAYLOAD",
        "operationalStatus": "UNKNOWN",
        "internationalDesignator": tle_object_id(line1[9:17]),
        "hasOrbitalData": True,
        "dataSources": {"orbit": "satnogs"},
        "dataQuality": "provider-supplied",
    })


def read_disk_cache() -> tuple[list[dict[str, Any]], str, str] | None:
    try:
        cached = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        if cached.get("schemaVersion") != CACHE_SCHEMA_VERSION:
            return None
        satellites = cached.get("satellites")
        updated_at = cached.get("updatedAt")
        upstream = cached.get("upstream")
        if isinstance(satellites, list) and isinstance(updated_at, str) and upstream in {"celestrak", "spacetrack", "satnogs"}:
            return satellites, updated_at, upstream
    except (OSError, json.JSONDecodeError, AttributeError):
        pass
    return None


def write_disk_cache(satellites: list[dict[str, Any]], updated_at: str, upstream: str) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = CACHE_FILE.with_suffix(".tmp")
    temporary.write_text(
        json.dumps({
            "schemaVersion": CACHE_SCHEMA_VERSION,
            "satellites": satellites,
            "updatedAt": updated_at,
            "upstream": upstream,
        }),
        encoding="utf-8",
    )
    temporary.replace(CACHE_FILE)


def read_public_catalog_cache() -> tuple[list[dict[str, Any]], str] | None:
    try:
        cached = json.loads(PUBLIC_CATALOG_CACHE_FILE.read_text(encoding="utf-8"))
        objects = cached.get("objects")
        updated_at = cached.get("updatedAt")
        if isinstance(objects, list) and isinstance(updated_at, str):
            return objects, updated_at
    except (OSError, json.JSONDecodeError, AttributeError):
        pass
    return None


def write_public_catalog_cache(objects: list[dict[str, Any]], updated_at: str) -> None:
    PUBLIC_CATALOG_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = PUBLIC_CATALOG_CACHE_FILE.with_suffix(".tmp")
    temporary.write_text(
        json.dumps({"objects": objects, "updatedAt": updated_at}, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(PUBLIC_CATALOG_CACHE_FILE)


@lru_cache(maxsize=1)
def fetch_public_catalog(cache_window: int) -> tuple[list[dict[str, Any]], str]:
    del cache_window
    request = Request(
        CELESTRAK_SATCAT_URL,
        headers={"User-Agent": "AstraScope/0.5"},
    )
    with urlopen(request, timeout=CELESTRAK_TIMEOUT_SECONDS, context=tls_context()) as response:
        content = response.read().decode("utf-8-sig")
    objects = [normalize_satcat(row) for row in csv.DictReader(io.StringIO(content))]
    objects = [item for item in objects if item["noradId"] > 0]
    if not objects:
        raise ValueError("CelesTrak SATCAT returned no catalog records")
    updated_at = datetime.now(timezone.utc).isoformat()
    write_public_catalog_cache(objects, updated_at)
    return objects, updated_at


def public_catalog() -> tuple[list[dict[str, Any]], str, str, str | None]:
    cached = read_public_catalog_cache()
    if cached:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(cached[1])
        if age.total_seconds() < SATCAT_CACHE_SECONDS:
            return cached[0], cached[1], "cache", None
    try:
        window = int(datetime.now(timezone.utc).timestamp() // SATCAT_CACHE_SECONDS)
        objects, updated_at = fetch_public_catalog(window)
        return objects, updated_at, "celestrak-satcat", None
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as exc:
        if cached:
            return cached[0], cached[1], "stale-cache", f"{type(exc).__name__}: catalog sync failed"
        return [], datetime.now(timezone.utc).isoformat(), "unavailable", f"{type(exc).__name__}: catalog unavailable"


@lru_cache(maxsize=1)
def fetch_catalog(cache_window: int) -> tuple[list[dict[str, Any]], str]:
    del cache_window
    request = Request(CELESTRAK_URL, headers={"User-Agent": "AstraScope/0.2"})
    with urlopen(request, timeout=CELESTRAK_TIMEOUT_SECONDS, context=tls_context()) as response:
        payload = json.load(response)
    if not isinstance(payload, list):
        return [], datetime.now(timezone.utc).isoformat()
    satellites = [normalize(item, "celestrak-gp") for item in payload if isinstance(item, dict)]
    updated_at = datetime.now(timezone.utc).isoformat()
    write_disk_cache(satellites, updated_at, "celestrak")
    return satellites, updated_at


@lru_cache(maxsize=1)
def fetch_satnogs_catalog(cache_window: int) -> tuple[list[dict[str, Any]], str]:
    del cache_window
    request = Request(SATNOGS_URL, headers={"User-Agent": "AstraScope/0.3", "Accept": "application/json"})
    with urlopen(request, timeout=45, context=tls_context()) as response:
        payload = json.load(response)
    if not isinstance(payload, list):
        raise ValueError("SatNOGS returned an invalid catalog")
    satellites = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            satellites.append(normalize_satnogs(item))
        except (ValueError, TypeError):
            continue
    if not satellites:
        raise ValueError("SatNOGS returned no valid orbital records")
    updated_at = datetime.now(timezone.utc).isoformat()
    write_disk_cache(satellites, updated_at, "satnogs")
    return satellites, updated_at


@lru_cache(maxsize=1)
def fetch_spacetrack_catalog(cache_window: int) -> tuple[list[dict[str, Any]], str]:
    del cache_window
    if not settings.has_space_track_credentials():
        raise ValueError("Space-Track credentials are not configured")

    opener = build_opener(HTTPCookieProcessor(CookieJar()), HTTPSHandler(context=tls_context()))
    login_body = urlencode({
        "identity": settings.space_track_identity,
        "password": settings.space_track_password,
    }).encode("utf-8")
    login_request = Request(
        SPACE_TRACK_LOGIN_URL,
        data=login_body,
        headers={"User-Agent": "AstraScope/0.4", "Content-Type": "application/x-www-form-urlencoded"},
    )
    with opener.open(login_request, timeout=30) as response:
        response.read()

    catalog_request = Request(
        SPACE_TRACK_GP_URL,
        headers={"User-Agent": "AstraScope/0.4", "Accept": "application/json"},
    )
    with opener.open(catalog_request, timeout=90) as response:
        payload = json.load(response)
    if not isinstance(payload, list) or not payload:
        raise ValueError("Space-Track returned no orbital records; verify the configured credentials")

    satellites = [normalize(item, "space-track") for item in payload if isinstance(item, dict)]
    updated_at = datetime.now(timezone.utc).isoformat()
    write_disk_cache(satellites, updated_at, "spacetrack")
    return satellites, updated_at


def fetch_primary_catalog(cache_window: int) -> tuple[list[dict[str, Any]], str, str]:
    errors = []
    if settings.has_space_track_credentials():
        try:
            satellites, updated_at = fetch_spacetrack_catalog(cache_window)
            return satellites, updated_at, "spacetrack"
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as exc:
            errors.append("Space-Track unavailable")
    try:
        satellites, updated_at = fetch_catalog(cache_window)
        return satellites, updated_at, "celestrak"
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as exc:
        errors.append("CelesTrak unavailable")
    raise ValueError("; ".join(errors))


@app.get("/satellites")
@app.get("/api/satellites")
def list_satellites(
    operator: str | None = Query(default=None),
    orbit: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=80),
) -> dict[str, Any]:
    global last_failure_at, last_failure_error
    preferred_upstream = "spacetrack" if settings.has_space_track_credentials() else "celestrak"
    source = preferred_upstream
    upstream: str | None = preferred_upstream
    error = None
    cached = read_disk_cache()
    try:
        cache_window = int(datetime.now(timezone.utc).timestamp() // CACHE_SECONDS)
        if cached:
            cache_age = datetime.now(timezone.utc) - datetime.fromisoformat(cached[1])
        else:
            cache_age = None
        if cached and cache_age and cache_age.total_seconds() < CACHE_SECONDS and cached[2] in {"celestrak", "spacetrack"}:
            satellites, updated_at, upstream = cached
            source = "cache"
        elif time.time() - last_failure_at < FAILURE_RETRY_SECONDS:
            error = last_failure_error
            if cached:
                satellites, updated_at, upstream = cached
                source = "stale-cache"
            else:
                satellites = []
                updated_at = datetime.now(timezone.utc).isoformat()
                source = "unavailable"
                upstream = None
        else:
            satellites, updated_at, upstream = fetch_primary_catalog(cache_window)
            source = upstream
    except (URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as exc:
        detail = ""
        if isinstance(exc, HTTPError):
            try:
                detail = exc.read().decode("utf-8", errors="replace").strip()
            except OSError:
                pass
        error = "Orbital catalog providers are temporarily unavailable"
        last_failure_at = time.time()
        last_failure_error = error
        if cached:
            satellites, updated_at, upstream = cached
            source = "stale-cache"
        else:
            try:
                satellites, updated_at = fetch_satnogs_catalog(cache_window)
                source = "satnogs"
                upstream = "satnogs"
            except (URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as fallback_exc:
                satellites = []
                updated_at = datetime.now(timezone.utc).isoformat()
                source = "unavailable"
                upstream = None
                error = "Orbital catalog providers and fallback are temporarily unavailable"

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
        "upstream": upstream,
        "scope": "tracked" if upstream == "spacetrack" else "active",
        "error": error,
    }


def filter_catalog_objects(
    objects: list[dict[str, Any]],
    *,
    mode: str,
    object_type_filter: str | None = None,
    status: str | None = None,
    orbit: str | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    filtered = objects
    if mode == "active":
        filtered = [item for item in filtered if item["objectType"] == "PAYLOAD" and item["operationalStatus"] == "ACTIVE" and not item["decayDate"]]
    elif mode == "on-orbit":
        filtered = [item for item in filtered if not item["decayDate"]]
    if object_type_filter:
        filtered = [item for item in filtered if item["objectType"] == object_type_filter]
    if status:
        filtered = [item for item in filtered if item["operationalStatus"] == status]
    if orbit:
        filtered = [item for item in filtered if item["orbitClass"] == orbit]
    if search:
        query = search.casefold().strip()
        filtered = [
            item for item in filtered
            if query in item["name"].casefold()
            or query in str(item["noradId"])
            or query in str(item.get("internationalDesignator") or "").casefold()
            or query in str(item.get("owner") or "").casefold()
        ]
    return filtered


@app.get("/catalog/summary")
@app.get("/api/catalog/summary")
def catalog_summary() -> dict[str, Any]:
    objects, updated_at, source, error = public_catalog()
    counts = {
        "activePayloads": sum(item["objectType"] == "PAYLOAD" and item["operationalStatus"] == "ACTIVE" and not item["decayDate"] for item in objects),
        "inactivePayloads": sum(item["objectType"] == "PAYLOAD" and item["operationalStatus"] == "INACTIVE" and not item["decayDate"] for item in objects),
        "rocketBodies": sum(item["objectType"] == "ROCKET_BODY" and not item["decayDate"] for item in objects),
        "debris": sum(item["objectType"] == "DEBRIS" and not item["decayDate"] for item in objects),
        "unknown": sum(item["objectType"] == "UNKNOWN" and not item["decayDate"] for item in objects),
        "totalPublicCatalog": len(objects),
    }
    return {"counts": counts, "updatedAt": updated_at, "source": source, "error": error}


@app.get("/catalog/objects")
@app.get("/api/catalog/objects")
@app.get("/catalog/search")
@app.get("/api/catalog/search")
def catalog_objects(
    mode: str = Query(default="all", pattern="^(active|on-orbit|all)$"),
    type: str | None = Query(default=None, pattern="^(PAYLOAD|ROCKET_BODY|DEBRIS|UNKNOWN)$"),
    status: str | None = Query(default=None, pattern="^(ACTIVE|INACTIVE|DECAYED|UNKNOWN)$"),
    orbit: str | None = Query(default=None, pattern="^(LEO|MEO|GEO|HEO|OTHER)$"),
    search: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    objects, updated_at, source, error = public_catalog()
    filtered = filter_catalog_objects(
        objects,
        mode=mode,
        object_type_filter=type,
        status=status,
        orbit=orbit,
        search=search,
    )
    start = (page - 1) * page_size
    return {
        "objects": filtered[start:start + page_size],
        "total": len(filtered),
        "page": page,
        "pageSize": page_size,
        "pages": (len(filtered) + page_size - 1) // page_size,
        "updatedAt": updated_at,
        "source": source,
        "error": error,
    }


@app.get("/catalog/objects/{norad_id}")
@app.get("/api/catalog/objects/{norad_id}")
def catalog_object_detail(norad_id: int) -> dict[str, Any]:
    objects, updated_at, source, error = public_catalog()
    item = next((candidate for candidate in objects if candidate["noradId"] == norad_id), None)
    if item is None:
        return {"object": None, "updatedAt": updated_at, "source": source, "error": error or "Object not found"}
    cached_orbits = read_disk_cache()
    orbit_record = next((candidate for candidate in cached_orbits[0] if candidate.get("noradId") == norad_id), None) if cached_orbits else None
    merged = {**item, **(orbit_record or {})}
    merged["hasOrbitalData"] = orbit_record is not None
    merged["dataSources"] = {**item["dataSources"], **((orbit_record or {}).get("dataSources") or {})}
    return {"object": merged, "updatedAt": updated_at, "source": source, "error": error}


@app.get("/catalog/orbits")
@app.get("/api/catalog/orbits")
def catalog_orbits(
    mode: str = Query(default="active", pattern="^(active|on-orbit)$"),
    debris: bool = Query(default=False),
    rocket_bodies: bool = Query(default=False),
) -> dict[str, Any]:
    response = list_satellites()
    records = response["satellites"]
    if mode == "active":
        records = [item for item in records if item["objectType"] == "PAYLOAD"]
    if not debris:
        records = [item for item in records if item["objectType"] != "DEBRIS"]
    if not rocket_bodies:
        records = [item for item in records if item["objectType"] != "ROCKET_BODY"]
    fields = (
        "id", "noradId", "name", "internationalDesignator", "objectType", "operationalStatus",
        "epoch", "inclination", "raan", "eccentricity", "argPericenter", "meanAnomaly",
        "meanMotion", "bstar", "meanMotionDot", "meanMotionDdot", "elementSetNo", "operator",
        "orbit", "purpose", "countryCode", "hasOrbitalData", "dataSources",
    )
    return {
        "objects": [{field: item.get(field) for field in fields} for item in records],
        "total": len(records),
        "updatedAt": response["updatedAt"],
        "source": response["source"],
        "upstream": response["upstream"],
        "scope": response["scope"],
        "error": response["error"],
    }


@app.get("/catalog/providers")
@app.get("/api/catalog/providers")
def catalog_provider_status() -> dict[str, Any]:
    orbital_cache = read_disk_cache()
    metadata_cache = read_public_catalog_cache()
    return {
        "spaceTrack": {
            "configured": settings.has_space_track_credentials(),
            "status": "healthy" if orbital_cache and orbital_cache[2] == "spacetrack" else "standby",
            "lastSuccess": orbital_cache[1] if orbital_cache and orbital_cache[2] == "spacetrack" else None,
        },
        "celestrak": {
            "configured": True,
            "status": "healthy" if orbital_cache or metadata_cache else "not-synced",
            "lastSuccess": max([value for value in (orbital_cache[1] if orbital_cache else None, metadata_cache[1] if metadata_cache else None) if value], default=None),
        },
        "satnogs": {"configured": True, "status": "fallback"},
        "discos": {
            "configured": settings.has_discos_credentials(),
            "status": "available-on-demand" if settings.has_discos_credentials() else "disabled",
        },
    }
