import {
  degreesLat,
  degreesLong,
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  gstime,
  jday,
  json2satrec,
  propagate,
  sunPos,
  twoline2satrec,
  type SatRec,
} from 'satellite.js';
import type { Observer, Satellite, SatellitePass } from '@/types/satellite';

export const EARTH_RADIUS_KM = 6378.137;
export const EARTH_SCENE_RADIUS = 1.35;
const EARTH_GRAVITATIONAL_PARAMETER = 398600.4418;
const satrecCache = new Map<string, SatRec>();

function getSatrec(satellite: Satellite) {
  const cached = satrecCache.get(satellite.id);
  if (cached) return cached;
  const satrec = satellite.tle1 && satellite.tle2
    ? twoline2satrec(satellite.tle1, satellite.tle2)
    : json2satrec({
        OBJECT_NAME: satellite.name,
        OBJECT_ID: satellite.objectId,
        EPOCH: satellite.epoch,
        MEAN_MOTION: satellite.meanMotion,
        ECCENTRICITY: satellite.eccentricity,
        INCLINATION: satellite.inclination,
        RA_OF_ASC_NODE: satellite.raan,
        ARG_OF_PERICENTER: satellite.argPericenter,
        MEAN_ANOMALY: satellite.meanAnomaly,
        NORAD_CAT_ID: satellite.noradId,
        ELEMENT_SET_NO: satellite.elementSetNo,
        BSTAR: satellite.bstar,
        MEAN_MOTION_DOT: satellite.meanMotionDot,
        MEAN_MOTION_DDOT: satellite.meanMotionDdot,
      });
  satrecCache.set(satellite.id, satrec);
  return satrec;
}

function state(satellite: Satellite, date: Date) {
  const result = propagate(getSatrec(satellite), date);
  if (!result) return null;
  const gmst = gstime(date);
  return { positionEci: result.position, positionEcf: eciToEcf(result.position, gmst), gmst };
}

export function satellitePosition(satellite: Satellite, date: Date): [number, number, number] {
  const result = state(satellite, date);
  if (!result) return [0, 0, 0];
  const scale = EARTH_SCENE_RADIUS / EARTH_RADIUS_KM;
  return [result.positionEcf.x * scale, result.positionEcf.z * scale, -result.positionEcf.y * scale];
}

export function satelliteGeodetic(satellite: Satellite, date: Date) {
  const result = state(satellite, date);
  if (!result) return null;
  const location = eciToGeodetic(result.positionEci, result.gmst);
  return {
    latitude: degreesLat(location.latitude),
    longitude: degreesLong(location.longitude),
    altitude: location.height,
  };
}

export function altitudeKm(satellite: Satellite, date = new Date()) {
  return Math.round(satelliteGeodetic(satellite, date)?.altitude ?? 0);
}

export function orbitalMetrics(satellite: Satellite, date = new Date()) {
  const periodMinutes = 1440 / satellite.meanMotion;
  const periodSeconds = periodMinutes * 60;
  const semiMajorAxisKm = Math.cbrt(EARTH_GRAVITATIONAL_PARAMETER * (periodSeconds / (2 * Math.PI)) ** 2);
  const altitude = satelliteGeodetic(satellite, date)?.altitude ?? semiMajorAxisKm - EARTH_RADIUS_KM;
  const radius = EARTH_RADIUS_KM + altitude;
  const speedKmS = Math.sqrt(Math.max(0, EARTH_GRAVITATIONAL_PARAMETER * (2 / radius - 1 / semiMajorAxisKm)));
  return {
    periodMinutes,
    perigeeKm: semiMajorAxisKm * (1 - satellite.eccentricity) - EARTH_RADIUS_KM,
    apogeeKm: semiMajorAxisKm * (1 + satellite.eccentricity) - EARTH_RADIUS_KM,
    speedKmS,
  };
}

export function groundTrack(satellite: Satellite, center: Date, samples = 120) {
  const periodMinutes = 1440 / satellite.meanMotion;
  return Array.from({ length: samples + 1 }, (_, index) => {
    const offset = (index / samples - 0.5) * periodMinutes * 60_000;
    return satellitePosition(satellite, new Date(center.getTime() + offset));
  });
}

export function footprintPoints(satellite: Satellite, date: Date, samples = 72) {
  const geo = satelliteGeodetic(satellite, date);
  if (!geo) return [];
  const angularRadius = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(geo.altitude, 1)));
  const latitude = degreesToRadians(geo.latitude);
  const longitude = degreesToRadians(geo.longitude);
  return Array.from({ length: samples + 1 }, (_, index) => {
    const bearing = (index / samples) * Math.PI * 2;
    const lat = Math.asin(Math.sin(latitude) * Math.cos(angularRadius) + Math.cos(latitude) * Math.sin(angularRadius) * Math.cos(bearing));
    const lon = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(latitude), Math.cos(angularRadius) - Math.sin(latitude) * Math.sin(lat));
    return globePoint(lat, lon, EARTH_SCENE_RADIUS * 1.004);
  });
}

export function observerPosition(observer: Observer) {
  return globePoint(degreesToRadians(observer.latitude), degreesToRadians(observer.longitude), EARTH_SCENE_RADIUS * 1.015);
}

function globePoint(latitude: number, longitude: number, radius: number): [number, number, number] {
  return [
    Math.cos(latitude) * Math.cos(longitude) * radius,
    Math.sin(latitude) * radius,
    -Math.cos(latitude) * Math.sin(longitude) * radius,
  ];
}

export function predictPasses(satellite: Satellite, observer: Observer, start: Date, hours = 24): SatellitePass[] {
  const observerGd = {
    latitude: degreesToRadians(observer.latitude),
    longitude: degreesToRadians(observer.longitude),
    height: observer.altitudeKm,
  };
  const passes: SatellitePass[] = [];
  const stepMs = 60_000;
  const end = start.getTime() + hours * 3_600_000;
  let current: SatellitePass | null = null;
  for (let timestamp = start.getTime(); timestamp <= end; timestamp += stepMs) {
    const date = new Date(timestamp);
    const result = state(satellite, date);
    if (!result) continue;
    const look = ecfToLookAngles(observerGd, result.positionEcf);
    const elevation = look.elevation * 180 / Math.PI;
    if (elevation >= 10) {
      if (!current) current = { rise: date, peak: date, set: date, maxElevation: elevation, rangeKm: look.rangeSat, visible: false };
      current.set = date;
      if (elevation > current.maxElevation) {
        current.peak = date;
        current.maxElevation = elevation;
        current.rangeKm = look.rangeSat;
        const sun = sunPos(jday(date));
        const sunEci = { x: sun.rsun[0], y: sun.rsun[1], z: sun.rsun[2] };
        const sunLook = ecfToLookAngles(observerGd, eciToEcf(sunEci, result.gmst));
        current.visible = isSunlit(result.positionEci, sunEci) && sunLook.elevation < degreesToRadians(-6);
      }
    } else if (current) {
      passes.push(current);
      current = null;
      if (passes.length === 3) break;
    }
  }
  if (current && passes.length < 3) passes.push(current);
  return passes;
}

function isSunlit(satellite: { x: number; y: number; z: number }, sun: { x: number; y: number; z: number }) {
  const sunMagnitude = Math.hypot(sun.x, sun.y, sun.z);
  const unitSun = { x: sun.x / sunMagnitude, y: sun.y / sunMagnitude, z: sun.z / sunMagnitude };
  const alongSun = satellite.x * unitSun.x + satellite.y * unitSun.y + satellite.z * unitSun.z;
  if (alongSun >= 0) return true;
  const perpendicularDistance = Math.hypot(
    satellite.x - alongSun * unitSun.x,
    satellite.y - alongSun * unitSun.y,
    satellite.z - alongSun * unitSun.z,
  );
  return perpendicularDistance > EARTH_RADIUS_KM;
}
