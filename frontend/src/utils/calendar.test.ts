import { describe, expect, it } from 'vitest';
import type { Observer, Satellite, SatellitePass } from '@/types/satellite';
import { calendarFilename, satellitePassCalendar } from './calendar';

const satellite = {
  id: 'iss-25544', name: 'ISS (ZARYA)', noradId: 25544, objectId: '1998-067A', epoch: '',
  inclination: 51.6, raan: 0, eccentricity: 0.001, argPericenter: 0, meanAnomaly: 0,
  meanMotion: 15.5, bstar: 0, meanMotionDot: 0, meanMotionDdot: 0, elementSetNo: 1,
  operator: 'NASA', orbit: 'LEO', purpose: 'Crewed station', countryCode: 'US', objectType: 'Payload',
} satisfies Satellite;
const observer: Observer = { latitude: 41.8781, longitude: -87.6298, altitudeKm: 0, label: 'Chicago, IL' };
const pass: SatellitePass = {
  rise: new Date('2026-08-15T01:00:00Z'), peak: new Date('2026-08-15T01:03:00Z'),
  set: new Date('2026-08-15T01:06:00Z'), maxElevation: 48.4, rangeKm: 610,
  visible: true, riseAzimuth: 90, setAzimuth: 270,
};

describe('satellite pass calendar', () => {
  it('creates a portable UTC event with a reminder and escaped location', () => {
    const calendar = satellitePassCalendar(satellite, pass, observer, 'https://astrascope.app/?satellite=iss-25544');

    expect(calendar).toContain('DTSTART:20260815T010000Z');
    expect(calendar).toContain('DTEND:20260815T010600Z');
    expect(calendar).toContain('SUMMARY:ISS (ZARYA) visible pass');
    expect(calendar).toContain('LOCATION:Chicago\\, IL (41.8781\\, -87.6298)');
    expect(calendar).toContain('TRIGGER:-PT10M');
    expect(calendarFilename(satellite, pass)).toBe('iss-zarya-2026-08-15.ics');
  });
});
