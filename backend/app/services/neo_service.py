import hashlib
import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from ..core.http import REQUEST_TIMEOUT_SECONDS, USER_AGENT, tls_context
from ..core.parsing import optional_float, optional_str
from ..models.impact import NearEarthObject

NEOWS_URL = "https://api.nasa.gov/neo/rest/v1/feed"
def _as_dict(value: Any) -> dict[str, Any]:
    """Return ``value`` when it is a dict, else an empty dict.

    Upstream nested objects are sometimes null or a stray scalar instead of
    an object; calling .get() on those raises AttributeError.
    """
    return value if isinstance(value, dict) else {}


def normalize_neo(entry: dict[str, Any]) -> NearEarthObject | None:
    approaches = entry.get("close_approach_data")
    if not isinstance(approaches, list) or not approaches:
        return None
    # An object can carry several approaches and they are not guaranteed
    # to arrive in date order, so the first entry is not necessarily the
    # next close approach. Use the earliest dated approach; entries
    # without a usable date cannot be ordered and are skipped.
    # Compare parsed dates, not strings: a non-padded "2026-9-2" sorts
    # after "2026-10-01" as a string even though it is earlier, and an
    # unparseable date must not win by string order either.
    dated = []
    for a in approaches:
        if not isinstance(a, dict):
            continue
        raw_date = optional_str(a.get("close_approach_date"))
        if not raw_date:
            continue
        try:
            parsed = datetime.strptime(raw_date, "%Y-%m-%d").date()
        except ValueError:
            continue
        dated.append((parsed, a))
    if not dated:
        return None
    parsed_date, approach = min(dated, key=lambda pair: pair[0])
    # Normalize to zero-padded ISO so the feed sort in fetch_neos (which
    # compares date strings) orders these the same way.
    approach_date = parsed_date.isoformat()
    # NASA sometimes returns null (or a non-object value) for nested objects;
    # treat them as empty dicts instead of crashing with AttributeError. An
    # AttributeError here would escape impact.py's except clause as an
    # unhandled 500 for the whole feed, not a skipped record.
    diameter = _as_dict(_as_dict(entry.get("estimated_diameter")).get("kilometers"))
    velocity = _as_dict(approach.get("relative_velocity"))
    distance = _as_dict(approach.get("miss_distance"))
    # Issue #69, continued: close_approach_date went through optional_str
    # earlier, but id/name still used str(), so a dict/list id or name
    # became a "{...}" garbage string. Non-string values are absent here
    # too, and the fallback chain runs on the cleaned values only.
    raw_id = optional_str(entry.get("id")) or optional_str(entry.get("neo_reference_id"))
    raw_name = optional_str(entry.get("name"))
    return NearEarthObject(
        id=raw_id or raw_name or approach_date,
        name=raw_name or "Unnamed object",
        nasaJplUrl=optional_str(entry.get("nasa_jpl_url")),
        estimatedDiameterMinKm=optional_float(diameter.get("estimated_diameter_min")),
        estimatedDiameterMaxKm=optional_float(diameter.get("estimated_diameter_max")),
        potentiallyHazardous=bool(entry.get("is_potentially_hazardous_asteroid", False)),
        closeApproachDate=approach_date,
        closeApproachDateTime=optional_str(approach.get("close_approach_date_full")),
        relativeVelocityKmS=optional_float(velocity.get("kilometers_per_second")),
        missDistanceKm=optional_float(distance.get("kilometers")),
        missDistanceLunar=optional_float(distance.get("lunar")),
        orbitingBody=optional_str(approach.get("orbiting_body")),
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
    # Anchor the query window to UTC: date.today() is server-local and can
    # shift the requested range by a day near midnight (every other upstream
    # window in this codebase is UTC-anchored).
    start = datetime.now(timezone.utc).date()
    params = urlencode({"start_date": start.isoformat(), "end_date": (start + timedelta(days=days - 1)).isoformat(), "api_key": api_key})
    request = Request(f"{NEOWS_URL}?{params}", headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS, context=tls_context()) as response:
        payload = json.load(response)
    if not isinstance(payload, dict):
        # Same guard the fireball fetcher has: a non-object payload is
        # malformed data, and .get() on it would raise AttributeError,
        # which impact.py does not catch, so it would escape as a 500
        # for the whole feed instead of the structured upstream error.
        raise ValueError("NASA NeoWs returned malformed data")
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
