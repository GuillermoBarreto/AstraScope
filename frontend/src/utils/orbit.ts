import type { Satellite } from '@/types/satellite';

const EARTH_RADIUS_KM = 6378.137;
const EARTH_SCENE_RADIUS = 1.35;
const MU = 398600.4418;
const DEG = Math.PI / 180;

export function satellitePosition(satellite: Satellite, date: Date): [number, number, number] {
  const epoch = new Date(satellite.epoch).getTime();
  const elapsedSeconds = Number.isFinite(epoch) ? (date.getTime() - epoch) / 1000 : 0;
  const meanMotionRad = (satellite.meanMotion * Math.PI * 2) / 86400;
  const semiMajor = Math.cbrt(MU / (meanMotionRad * meanMotionRad));
  const meanAnomaly = satellite.meanAnomaly * DEG + meanMotionRad * elapsedSeconds;
  const eccentricAnomaly = solveKepler(meanAnomaly, satellite.eccentricity);
  const trueAnomaly = 2 * Math.atan2(
    Math.sqrt(1 + satellite.eccentricity) * Math.sin(eccentricAnomaly / 2),
    Math.sqrt(1 - satellite.eccentricity) * Math.cos(eccentricAnomaly / 2),
  );
  const radius = semiMajor * (1 - satellite.eccentricity * Math.cos(eccentricAnomaly));
  const argument = satellite.argPericenter * DEG + trueAnomaly;
  const inclination = satellite.inclination * DEG;
  const raan = satellite.raan * DEG - greenwichAngle(date);
  const x = radius * (Math.cos(raan) * Math.cos(argument) - Math.sin(raan) * Math.sin(argument) * Math.cos(inclination));
  const y = radius * Math.sin(argument) * Math.sin(inclination);
  const z = radius * (Math.sin(raan) * Math.cos(argument) + Math.cos(raan) * Math.sin(argument) * Math.cos(inclination));
  const scale = EARTH_SCENE_RADIUS / EARTH_RADIUS_KM;
  return [x * scale, y * scale, z * scale];
}

export function altitudeKm(satellite: Satellite) {
  const radiansPerSecond = (satellite.meanMotion * Math.PI * 2) / 86400;
  return Math.round(Math.cbrt(MU / (radiansPerSecond * radiansPerSecond)) - EARTH_RADIUS_KM);
}

function solveKepler(meanAnomaly: number, eccentricity: number) {
  let value = meanAnomaly;
  for (let index = 0; index < 7; index += 1) {
    value -= (value - eccentricity * Math.sin(value) - meanAnomaly) / (1 - eccentricity * Math.cos(value));
  }
  return value;
}

function greenwichAngle(date: Date) {
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const days = julianDate - 2451545;
  return ((280.46061837 + 360.98564736629 * days) % 360) * DEG;
}
