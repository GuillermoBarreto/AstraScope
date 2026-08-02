import json
import re
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from app.core.config import settings
except ModuleNotFoundError:  # pragma: no cover - supports direct module execution
    from backend.app.core.config import settings

app = FastAPI(title="OrbitWatch API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "orbitwatch-backend",
        "environment": settings.app_env,
    }


@app.get("/satellites")
@app.get("/api/satellites")
def list_satellites() -> dict[str, Any]:
    try:
        with urlopen("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json", timeout=20) as response:
            payload = json.load(response)
    except (URLError, TimeoutError, json.JSONDecodeError):
        return {
            "satellites": [
                {
                    "id": "example-iss",
                    "name": "ISS (ZARYA)",
                    "noradId": 25544,
                    "objectId": "1998-067A",
                    "epoch": "2026-01-01",
                    "inclination": 51.6,
                    "classification": "active",
                }
            ]
        }

    if not isinstance(payload, list):
        return {"satellites": []}

    satellites: list[dict[str, Any]] = []
    for entry in payload[:12]:
        if not isinstance(entry, dict):
            continue

        name = str(entry.get("OBJECT_NAME", "Unknown satellite"))
        norad_id = entry.get("NORAD_CAT_ID") or 0
        object_id = str(entry.get("OBJECT_ID", "unknown"))
        epoch = str(entry.get("EPOCH", "unknown"))
        inclination = entry.get("INCLINATION") or 0.0

        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "satellite"
        satellites.append(
            {
                "id": f"{slug}-{norad_id}",
                "name": name,
                "noradId": int(norad_id) if isinstance(norad_id, (int, float)) else 0,
                "objectId": object_id,
                "epoch": epoch,
                "inclination": float(inclination) if isinstance(inclination, (int, float)) else 0.0,
                "classification": "active",
            }
        )

    return {"satellites": satellites}
