export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'HEO';

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
};

export type Observer = { latitude: number; longitude: number; altitudeKm: number; label: string };

export type SatellitePass = {
  rise: Date;
  peak: Date;
  set: Date;
  maxElevation: number;
  rangeKm: number;
  visible: boolean;
};

export type SatelliteResponse = {
  satellites: Satellite[];
  total: number;
  updatedAt: string;
  source: 'celestrak' | 'satnogs' | 'cache' | 'stale-cache' | 'unavailable';
  error?: string | null;
};
