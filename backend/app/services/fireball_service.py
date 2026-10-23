import json
import math
import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from ..core.http import REQUEST_TIMEOUT_SECONDS, USER_AGENT, tls_context
from ..core.parsing import optional_float
from ..models.impact import Fireball

FIREBALL_URL = "https://ssd-api.jpl.nasa.gov/fireball.api"

# Trailing timezone designator on an upstream timestamp: "Z" or a numeric
# offset with an optional colon and an optional minute component ("+00:00",
# "+0000", "+05"). One compiled pattern shared by normalize_fireball's
# Z-append check and its id-slug strip, so the two can never drift apart and
# leak a designator into a stable dedup id.
TZ_SUFFIX = re.compile(r"(?:Z|[+-]\d{2}(?::?\d{2})?)$", re.IGNORECASE)


def normalize_fireball(fields: list[str], row: list[Any]) -> Fireball | None:
    record = dict(zip(fields, row))
    timestamp = record.get("date")
    energy = optional_float(record.get("energy"))
    impact_energy = optional_float(record.get("impact-e"))
    if not timestamp or energy is None or impact_energy is None:
        return None
    # CNEOS usually returns bare "YYYY-MM-DD HH:MM:SS" stamps, but only stamp
    # the value as UTC when it carries no timezone designator: blindly
    # appending "Z" to an already-zoned timestamp would produce malformed ISO
    # like "...ZZ" or "...+05Z" (a bare two-digit offset is a real ISO-8601
    # designator, so TZ_SUFFIX deliberately matches it too).
    date_time = str(timestamp).replace(" ", "T")
    if not TZ_SUFFIX.search(date_time):
        date_time += "Z"
    latitude = optional_float(record.get("lat"))
    longitude = optional_float(record.get("lon"))
    # Use -abs(): the API sometimes already returns a signed value alongside
    # the direction flag, and multiplying an already-negative value by -1
    # would flip it into the wrong hemisphere.
    if latitude is not None and record.get("lat-dir") == "S":
        latitude = -abs(latitude)
    if longitude is not None and record.get("lon-dir") == "W":
        longitude = -abs(longitude)
    components = [optional_float(record.get(key)) for key in ("vx", "vy", "vz")]
    velocity = math.sqrt(sum(value * value for value in components)) if all(value is not None for value in components) else None
    location = f"{abs(latitude):.1f}° {'N' if latitude >= 0 else 'S'}, {abs(longitude):.1f}° {'E' if longitude >= 0 else 'W'}" if latitude is not None and longitude is not None else None
    # Build the id from the already-normalized date_time, not the raw
    # timestamp: a zoned upstream stamp ("...+00:00" or "...Z") would otherwise
    # leak its designator into the id while dateTime is normalized separately,
    # so ids silently drift whenever the upstream format changes.
    # Strip the timezone designator with the same shared pattern used above:
    # a designator that survived the Z-append check (any of the TZ_SUFFIX
    # forms) must never leak into the id while dateTime is normalized
    # separately, or ids silently drift whenever the upstream format changes.
    slug = TZ_SUFFIX.sub("", date_time).replace(":", "-")
    # Round the coordinate suffix to 3 decimals (~100 m) and use abs() so a
    # negative latitude/longitude cannot render as a double dash
    # ("--10.0--20.0"). The id is a stable dedup key: raw float precision from
    # the upstream feed must not silently rewrite it when the formatting
    # changes (#60).
    coords = f"-{round(abs(latitude), 3)}-{round(abs(longitude), 3)}" if location else ""
    return Fireball(
        id=slug + coords,
        dateTime=date_time,
        latitude=latitude,
        longitude=longitude,
        altitudeKm=optional_float(record.get("alt")),
        velocityKmS=velocity,
        energy=energy,
        impactEnergyKt=impact_energy,
        locationDescription=location,
    )


def fetch_fireballs(days: int, cache_window: int) -> list[Fireball]:
    """Fetch fireballs, caching per (days, cache_window).

    The day count is clamped before the cache key is built, so days=0 and
    days=1 share a single cache entry instead of duplicating identical
    upstream requests (mirrors fetch_neos in neo_service).
    """
    return _fetch_fireballs_cached(max(1, days), cache_window)


@lru_cache(maxsize=32)
def _fetch_fireballs_cached(days: int, cache_window: int) -> list[Fireball]:
    del cache_window
    # Anchor the query window to UTC: date.today() is server-local and can
    # shift the requested range by a day near midnight (mirrors fetch_neos).
    start = datetime.now(timezone.utc).date() - timedelta(days=days)
    params = urlencode({"date-min": start.isoformat(), "vel-comp": "true", "sort": "-date"})
    request = Request(f"{FIREBALL_URL}?{params}", headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS, context=tls_context()) as response:
        payload = json.load(response)
    if not isinstance(payload, dict):
        # A non-object payload is malformed data, not an empty feed: surfacing
        # it as a structured upstream error (like fetch_neos does) is more
        # honest than reporting a successful sync with zero fireballs.
        raise ValueError("JPL Fireball API returned malformed data")
    try:
        count = int(payload.get("count", 0))
    except (TypeError, ValueError) as exc:
        # A non-numeric count is malformed data, not a stray TypeError/ValueError
        # escaping as an unhandled 500: keep it a structured upstream error.
        raise ValueError("JPL Fireball API returned malformed data") from exc
    if count == 0:
        return []
    fields, rows = payload.get("fields"), payload.get("data")
    if not isinstance(fields, list) or not isinstance(rows, list):
        raise ValueError("JPL Fireball API returned malformed data")
    events = [
        event
        for row in rows
        if isinstance(row, list) and len(row) == len(fields)
        and (event := normalize_fireball(fields, row)) is not None
    ]
    return events
