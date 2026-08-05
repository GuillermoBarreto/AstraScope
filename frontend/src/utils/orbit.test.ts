import { describe, expect, it } from 'vitest';
import type { Satellite } from '@/types/satellite';
import { orbitalMetrics, satelliteGeodetic, satellitePosition } from '@/utils/orbit';

const iss: Satellite = {
  id: 'iss-25544', name: 'ISS', noradId: 25544, objectId: '1998-067A',
  epoch: '2026-08-02T12:09:08.796Z', inclination: 51.6315, raan: 70.8679,
  eccentricity: 0.0007172, argPericenter: 4.7554, meanAnomaly: 355.3502,
  meanMotion: 15.49313226, bstar: 0, meanMotionDot: 0, meanMotionDdot: 0,
  elementSetNo: 999, operator: 'NASA', orbit: 'LEO', purpose: 'Crewed station',
  countryCode: 'US', objectType: 'Payload',
  tle1: '1 25544U 98067A   26214.50635181  .00006342  00000-0  12183-3 0  9997',
  tle2: '2 25544  51.6315  70.8679 0007172   4.7554 355.3502 15.49313226578933',
};

describe('SGP4 orbit utilities', () => {
  it('propagates a real TLE into a plausible LEO position', () => {
    const date = new Date('2026-08-02T12:10:00Z');
    const position = satellitePosition(iss, date);
    const geodetic = satelliteGeodetic(iss, date);
    expect(position.every(Number.isFinite)).toBe(true);
    expect(geodetic?.altitude).toBeGreaterThan(350);
    expect(geodetic?.altitude).toBeLessThan(500);
  });

  it('derives useful orbital metrics', () => {
    const metrics = orbitalMetrics(iss, new Date('2026-08-02T12:10:00Z'));
    expect(metrics.periodMinutes).toBeGreaterThan(90);
    expect(metrics.periodMinutes).toBeLessThan(100);
    expect(metrics.speedKmS).toBeGreaterThan(7);
    expect(metrics.apogeeKm).toBeGreaterThan(metrics.perigeeKm);
  });
});
