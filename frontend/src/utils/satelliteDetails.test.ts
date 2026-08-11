import { describe, expect, it } from 'vitest';
import type { Satellite } from '@/types/satellite';
import { canonicalSatelliteUrl, formatPeriod, formatVelocity } from '@/utils/satelliteDetails';

const satellite = { id: 'iss-25544' } as Satellite;

describe('satellite detail formatting', () => {
  it('formats orbital periods for low and geosynchronous orbits', () => {
    expect(formatPeriod(92.73)).toBe('92.7 min');
    expect(formatPeriod(1436)).toBe('23 h 56 min');
    expect(formatPeriod(null)).toBe('Not available');
  });

  it('formats propagated velocity in both useful units', () => {
    expect(formatVelocity(7.66)).toContain('7.66 km/s');
    expect(formatVelocity(7.66)).toContain('27,576 km/h');
    expect(formatVelocity(null)).toBe('Not available');
  });

  it('creates a canonical satellite deep link without another watch mode', () => {
    const location = { href: 'https://astrascope.example/?view=impact&foo=bar' } as Location;
    expect(canonicalSatelliteUrl(satellite, location)).toBe('https://astrascope.example/?foo=bar&satellite=iss-25544');
  });
});
