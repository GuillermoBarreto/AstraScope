import { describe, expect, it } from 'vitest';
import type { Satellite } from '@/types/satellite';
import { compassDirection, groundTrack, orbitalMetrics, orbitalPeriodMinutes, predictPasses, satelliteGeodetic, satellitePosition, satelliteVelocityKmS, sunScenePosition } from '@/utils/orbit';

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
  it('places the Sun at the requested scene distance', () => {
    const position = sunScenePosition(new Date('2026-08-05T12:00:00Z'), 14);
    expect(Math.hypot(...position)).toBeCloseTo(14, 6);
    expect(position.every(Number.isFinite)).toBe(true);
  });

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
    expect(orbitalPeriodMinutes(iss.meanMotion)).toBeCloseTo(92.94, 1);
    expect(orbitalPeriodMinutes(0)).toBeNull();
    expect(satelliteVelocityKmS(iss, new Date('2026-08-02T12:10:00Z'))).toBeGreaterThan(7);
  });

  it('returns null metrics for records with no usable mean motion', () => {
    const metrics = orbitalMetrics({ ...iss, meanMotion: 0 }, new Date('2026-08-02T12:10:00Z'));
    expect(metrics).toEqual({ periodMinutes: null, perigeeKm: null, apogeeKm: null, speedKmS: null });
  });

  it('formats pass azimuths as compass directions', () => {
    expect(compassDirection(0)).toBe('N');
    expect(compassDirection(225)).toBe('SW');
    expect(compassDirection(359)).toBe('N');
  });
});


describe('predictPasses visibility', () => {
  const observer = { latitude: 41.8781, longitude: -87.6298, altitudeKm: 0, label: 'Chicago, IL' };

  it('marks a one-sample pass visible when the satellite is sunlit', () => {
    // A pass clipped to a single sample: the window holds only the peak
    // minute, so rise == set == peak. The peak is the first sample, and
    // the visibility check used to run only when a sample beat the
    // running maximum — the first sample never does, so a one-sample
    // pass stayed invisible even under a sunlit sky (issue #85).
    const peak = new Date('2026-08-02T17:04:00Z');
    const passes = predictPasses(iss, observer, peak, 1 / 120);
    expect(passes).toHaveLength(1);
    expect(passes[0].rise.getTime()).toBe(passes[0].set.getTime());
    expect(passes[0].visible).toBe(true);
  });
});

describe('groundTrack failures', () => {
  it('skips samples SGP4 cannot propagate instead of drawing to the earth center', () => {
    // A record with an impossible eccentricity makes the propagator
    // fail every sample, and the old code plotted those at [0, 0, 0] —
    // the center of the earth (issue #79). No returned point may be
    // the origin. (Without TLEs, so the elements — not the TLE — feed
    // the propagator.)
    const noTle = { ...iss, tle1: undefined, tle2: undefined, eccentricity: 2 };
    const points = groundTrack(noTle, new Date('2026-08-02T12:10:00Z'));
    expect(points).toEqual([]);
  });
});
