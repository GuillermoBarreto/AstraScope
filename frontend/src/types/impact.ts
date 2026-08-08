export type NearEarthObject = {
  id: string;
  name: string;
  nasaJplUrl: string | null;
  estimatedDiameterMinKm: number | null;
  estimatedDiameterMaxKm: number | null;
  potentiallyHazardous: boolean;
  closeApproachDate: string;
  closeApproachDateTime: string | null;
  relativeVelocityKmS: number | null;
  missDistanceKm: number | null;
  missDistanceLunar: number | null;
  orbitingBody: string | null;
};

export type Fireball = {
  id: string;
  dateTime: string;
  latitude: number | null;
  longitude: number | null;
  altitudeKm: number | null;
  velocityKmS: number | null;
  energy: number;
  impactEnergyKt: number;
  locationDescription: string | null;
};

export type ImpactResponse<T extends 'neos' | 'fireballs'> = {
  total: number;
  updatedAt: string;
  source: 'live-or-cache' | 'unavailable';
  provider: string;
  error: { code: string; message: string } | null;
} & Record<T, T extends 'neos' ? NearEarthObject[] : Fireball[]>;
