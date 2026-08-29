export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'HEO' | 'OTHER';
export type ObjectType = 'PAYLOAD' | 'ROCKET_BODY' | 'DEBRIS' | 'UNKNOWN';
export type OperationalStatus = 'ACTIVE' | 'INACTIVE' | 'DECAYED' | 'UNKNOWN';

export type CatalogObject = {
  id: string;
  noradId: number;
  name: string;
  internationalDesignator: string | null;
  objectType: ObjectType;
  operationalStatus: OperationalStatus;
  isActive: boolean;
  countryCode: string | null;
  owner: string | null;
  launchDate: string | null;
  launchSite: string | null;
  decayDate: string | null;
  orbitalPeriodMinutes: number | null;
  inclination: number | null;
  apogeeKm: number | null;
  perigeeKm: number | null;
  orbitClass: OrbitClass;
  hasOrbitalData: boolean;
  dataStatus: string | null;
  dataSources: Record<string, string>;
  dataQuality: 'verified' | 'provider-supplied' | 'curated' | 'inferred';
};

export type Satellite = {
  id: string;
  name: string;
  noradId: number;
  objectId: string;
  epoch: string;
  inclination: number;
  raan: number;
  eccentricity: number;
  argPericenter: number;
  meanAnomaly: number;
  meanMotion: number;
  bstar: number;
  meanMotionDot: number;
  meanMotionDdot: number;
  elementSetNo: number;
  tle1?: string;
  tle2?: string;
  operator: string;
  orbit: OrbitClass;
  purpose: string;
  countryCode: string;
  objectType: string;
  operationalStatus?: OperationalStatus;
  internationalDesignator?: string | null;
  hasOrbitalData?: boolean;
  dataSources?: Record<string, string>;
  description?: string;
  launchDate?: string;
  launchVehicle?: string;
  launchSite?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageCredit?: string;
  imageSourceUrl?: string;
  sourceUrl?: string;
};

export type Observer = { latitude: number; longitude: number; altitudeKm: number; label: string };

export type SatellitePass = {
  rise: Date;
  peak: Date;
  set: Date;
  maxElevation: number;
  rangeKm: number;
  visible: boolean;
  riseAzimuth: number;
  setAzimuth: number;
};

export type SatelliteResponse = {
  satellites: Satellite[];
  total: number;
  updatedAt: string;
  source: 'celestrak' | 'spacetrack' | 'satnogs' | 'cache' | 'stale-cache' | 'unavailable';
  upstream?: 'celestrak' | 'spacetrack' | 'satnogs' | null;
  scope?: 'active' | 'tracked';
  error?: string | null;
};
