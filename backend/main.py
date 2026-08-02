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
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "orbitwatch-backend",
        "environment": settings.app_env,
    }
