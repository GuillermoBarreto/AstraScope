import { describe, expect, it, vi } from 'vitest';
import type { Observer, Satellite, SatellitePass } from '@/types/satellite';
import { skyTonightPasses } from './skyTonight';

const observer: Observer = { latitude: 41.9, longitude: -87.6, altitudeKm: 0, label: 'Chicago' };
const satellite = (id: string): Satellite => ({
  id, name: id.toUpperCase(), noradId: Number(id.replace(/\D/g, '')) || 1, objectId: '',
  epoch: '2026-08-13T00:00:00Z', inclination: 51.6, raan: 0, eccentricity: 0.001,
  argPericenter: 0, meanAnomaly: 0, meanMotion: 15, bstar: 0, meanMotionDot: 0,
  meanMotionDdot: 0, elementSetNo: 1, operator: 'Test', orbit: 'LEO', purpose: 'Science',
  countryCode: 'US', objectType: 'Payload',
});
const pass = (rise: string, visible: boolean, maxElevation: number): SatellitePass => ({
  rise: new Date(rise), peak: new Date(rise),
  set: new Date(new Date(rise).getTime() + 6 * 60_000), visible, maxElevation,
  rangeKm: 800, riseAzimuth: 90, setAzimuth: 270,
});

describe('skyTonightPasses', () => {
  it('keeps visible passes and ranks them by rise time', () => {
    const sats = [satellite('sat-1'), satellite('sat-2')];
    const predictor = vi.fn((item: Satellite) => item.id === 'sat-1'
      ? [pass('2026-08-13T22:00:00Z', false, 80), pass('2026-08-14T01:00:00Z', true, 30)]
      : [pass('2026-08-14T00:00:00Z', true, 20)]);

    const result = skyTonightPasses(sats, observer, new Date('2026-08-13T20:00:00Z'), 6, predictor);

    expect(result.map((item) => item.satellite.id)).toEqual(['sat-2', 'sat-1']);
    expect(result.every((item) => item.visible)).toBe(true);
  });
});
