import time
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError

from fastapi import APIRouter, Query

from ..core.config import settings
from ..services.fireball_service import fetch_fireballs
from ..services.neo_service import fetch_neos

router = APIRouter(tags=["Impact Watch"])
CACHE_SECONDS = 15 * 60


def response(items_key: str, items: list[Any], provider: str, error: str | None = None) -> dict[str, Any]:
    return {
        items_key: [item.model_dump() for item in items],
        "total": len(items),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "unavailable" if error else "live-or-cache",
        "provider": provider,
        "error": {"code": "UPSTREAM_UNAVAILABLE", "message": error} if error else None,
    }


@router.get("/impact/neos")
@router.get("/api/impact/neos")
def neos(days: int = Query(7, ge=1, le=7), hazardous: bool = False, min_diameter_km: float = Query(0, ge=0, le=1000)) -> dict[str, Any]:
    try:
        items = fetch_neos(days, settings.nasa_api_key, int(time.time() // CACHE_SECONDS))
        if hazardous:
            items = [item for item in items if item.potentiallyHazardous]
        if min_diameter_km:
            items = [item for item in items if (item.estimatedDiameterMaxKm or 0) >= min_diameter_km]
        return response("neos", items, "NASA/JPL NeoWs")
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
        return response("neos", [], "NASA/JPL NeoWs", f"{type(exc).__name__}: {exc}")


@router.get("/impact/fireballs")
@router.get("/api/impact/fireballs")
def fireballs(days: int = Query(30, ge=1, le=3650), min_energy: float = Query(0, ge=0), has_coordinates: bool | None = None) -> dict[str, Any]:
    try:
        items = fetch_fireballs(days, int(time.time() // CACHE_SECONDS))
        if min_energy:
            items = [item for item in items if item.energy >= min_energy]
        if has_coordinates is not None:
            items = [item for item in items if (item.latitude is not None and item.longitude is not None) is has_coordinates]
        return response("fireballs", items, "NASA/JPL CNEOS Fireball Data API")
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
        return response("fireballs", [], "NASA/JPL CNEOS Fireball Data API", f"{type(exc).__name__}: {exc}")
