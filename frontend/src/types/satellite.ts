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
  operator: string;
  orbit: OrbitClass;
};

export type SatelliteResponse = {
  satellites: Satellite[];
  total: number;
  updatedAt: string;
  source: 'celestrak' | 'unavailable';
  error?: string | null;
};
