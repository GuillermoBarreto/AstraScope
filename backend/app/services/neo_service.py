import hashlib
import json
from datetime import date, timedelta
from functools import lru_cache
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from ..core.http import tls_context
from ..core.parsing import optional_float
from ..models.impact import NearEarthObject

NEOWS_URL = "https://api.nasa.gov/neo/rest/v1/feed"
TIMEOUT_SECONDS = 20


def normalize_neo(entry: dict[str, Any]) -> NearEarthObject | None:
    approaches = entry.get("close_approach_data")
    if not isinstance(approaches, list) or not approaches or not isinstance(approaches[0], dict):
        return None
    approach = approaches[0]
    # NASA sometimes returns null for nested objects; treat them as empty dicts
    # instead of crashing with AttributeError.
    diameter = (entry.get("estimated_diameter") or {}).get("kilometers") or {}
    velocity = approach.get("relative_velocity") or {}
    distance = approach.get("miss_distance") or {}
    approach_date = str(approach.get("close_approach_date") or "")
    if not approach_date:
        return None
    return NearEarthObject(
        id=str(entry.get("id") or entry.get("neo_reference_id") or entry.get("name") or approach_date),
        name=str(entry.get("name") or "Unnamed object"),
        nasaJplUrl=entry.get("nasa_jpl_url"),
        estimatedDiameterMinKm=optional_float(diameter.get("estimated_diameter_min")),
        estimatedDiameterMaxKm=optional_float(diameter.get("estimated_diameter_max")),
        potentiallyHazardous=bool(entry.get("is_potentially_hazardous_asteroid", False)),
        closeApproachDate=approach_date,
        closeApproachDateTime=approach.get("close_approach_date_full"),
        relativeVelocityKmS=optional_float(velocity.get("kilometers_per_second")),
        missDistanceKm=optional_float(distance.get("kilometers")),
        missDistanceLunar=optional_float(distance.get("lunar")),
        orbitingBody=approach.get("orbiting_body"),
    )


def _key_fingerprint(api_key: str) -> str:
    """SHA-256 fingerprint identifying an API key without exposing it.

    The raw key must never be part of the ``lru_cache`` key below: cache
    argument tuples are retained for the whole process lifetime.
    """
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def fetch_neos(days: int, api_key: str, cache_window: int) -> list[NearEarthObject]:
    """Fetch near-earth objects, caching per (days, key fingerprint, window).

    The cache key carries a SHA-256 fingerprint of the API key instead of the
    key itself, so the secret is never retained in the cache's argument tuples.
    """
    # A day count below 1 would push the end date before the start date and
    # ask NASA for an inverted range, so clamp it.
    return _fetch_neos_cached(max(1, days), _key_fingerprint(api_key), cache_window)


@lru_cache(maxsize=32)
def _fetch_neos_cached(days: int, key_fingerprint: str, cache_window: int) -> list[NearEarthObject]:
    del cache_window
    from ..core.config import settings  # local import: config never imports services
    api_key = settings.nasa_api_key
    if _key_fingerprint(api_key) != key_fingerprint:
        # The configured key rotated after this entry was cached: drop the
        # stale entries instead of serving them under a different key.
        _fetch_neos_cached.cache_clear()
        raise ValueError("NASA API key changed; NeoWs cache cleared, retry the request")
    start = date.today()
    params = urlencode({"start_date": start.isoformat(), "end_date": (start + timedelta(days=days - 1)).isoformat(), "api_key": api_key})
    request = Request(f"{NEOWS_URL}?{params}", headers={"User-Agent": "AstraScope/0.5", "Accept": "application/json"})
    with urlopen(request, timeout=TIMEOUT_SECONDS, context=tls_context()) as response:
        payload = json.load(response)
    days_payload = payload.get("near_earth_objects")
    if not isinstance(days_payload, dict):
        raise ValueError("NASA NeoWs returned malformed data")
    objects: list[NearEarthObject] = []
    for entries in days_payload.values():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if isinstance(entry, dict) and (normalized := normalize_neo(entry)) is not None:
                objects.append(normalized)
    return sorted(objects, key=lambda item: (item.closeApproachDate, item.name))
