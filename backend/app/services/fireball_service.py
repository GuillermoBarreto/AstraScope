import json
import math
from datetime import date, timedelta
from functools import lru_cache
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from ..core.http import tls_context
from ..models.impact import Fireball

FIREBALL_URL = "https://ssd-api.jpl.nasa.gov/fireball.api"
TIMEOUT_SECONDS = 20


def optional_float(value: Any) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def normalize_fireball(fields: list[str], row: list[Any]) -> Fireball | None:
    record = dict(zip(fields, row))
    timestamp = record.get("date")
    energy = optional_float(record.get("energy"))
    impact_energy = optional_float(record.get("impact-e"))
    if not timestamp or energy is None or impact_energy is None:
        return None
    latitude = optional_float(record.get("lat"))
    longitude = optional_float(record.get("lon"))
    if latitude is not None and record.get("lat-dir") == "S":
        latitude *= -1
    if longitude is not None and record.get("lon-dir") == "W":
        longitude *= -1
    components = [optional_float(record.get(key)) for key in ("vx", "vy", "vz")]
    velocity = math.sqrt(sum(value * value for value in components)) if all(value is not None for value in components) else None
    location = f"{abs(latitude):.1f}° {'N' if latitude >= 0 else 'S'}, {abs(longitude):.1f}° {'E' if longitude >= 0 else 'W'}" if latitude is not None and longitude is not None else None
    return Fireball(
        id=str(timestamp).replace(" ", "T").replace(":", "-") + (f"-{latitude}-{longitude}" if location else ""),
        dateTime=str(timestamp).replace(" ", "T") + "Z",
        latitude=latitude,
        longitude=longitude,
        altitudeKm=optional_float(record.get("alt")),
        velocityKmS=velocity,
        energy=energy,
        impactEnergyKt=impact_energy,
        locationDescription=location,
    )


@lru_cache(maxsize=32)
def fetch_fireballs(days: int, cache_window: int) -> list[Fireball]:
    del cache_window
    start = date.today() - timedelta(days=days)
    params = urlencode({"date-min": start.isoformat(), "vel-comp": "true", "sort": "-date"})
    request = Request(f"{FIREBALL_URL}?{params}", headers={"User-Agent": "AstraScope/0.5", "Accept": "application/json"})
    with urlopen(request, timeout=TIMEOUT_SECONDS, context=tls_context()) as response:
        payload = json.load(response)
    if int(payload.get("count", 0)) == 0:
        return []
    fields, rows = payload.get("fields"), payload.get("data")
    if not isinstance(fields, list) or not isinstance(rows, list):
        raise ValueError("JPL Fireball API returned malformed data")
    events = [event for row in rows if isinstance(row, list) and (event := normalize_fireball(fields, row)) is not None]
    return events
