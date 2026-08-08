from dataclasses import dataclass
import os

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_env: str = os.getenv("APP_ENV", "development")
    cors_origins: str = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    space_track_identity: str = os.getenv("SPACE_TRACK_IDENTITY", "")
    space_track_password: str = os.getenv("SPACE_TRACK_PASSWORD", "")
    nasa_api_key: str = os.getenv("NASA_API_KEY", "DEMO_KEY")

    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def has_space_track_credentials(self) -> bool:
        return bool(self.space_track_identity and self.space_track_password)


settings = Settings()
