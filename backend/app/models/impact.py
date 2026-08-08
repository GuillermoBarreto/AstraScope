from pydantic import BaseModel, ConfigDict


class ImpactModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class NearEarthObject(ImpactModel):
    id: str
    name: str
    nasaJplUrl: str | None = None
    estimatedDiameterMinKm: float | None = None
    estimatedDiameterMaxKm: float | None = None
    potentiallyHazardous: bool
    closeApproachDate: str
    closeApproachDateTime: str | None = None
    relativeVelocityKmS: float | None = None
    missDistanceKm: float | None = None
    missDistanceLunar: float | None = None
    orbitingBody: str | None = None


class Fireball(ImpactModel):
    id: str
    dateTime: str
    latitude: float | None = None
    longitude: float | None = None
    altitudeKm: float | None = None
    velocityKmS: float | None = None
    energy: float
    impactEnergyKt: float
    locationDescription: str | None = None
