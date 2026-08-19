import type { Observer, Satellite, SatellitePass } from '@/types/satellite';

const escapeIcs = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const utcStamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function satellitePassCalendar(
  satellite: Satellite,
  pass: SatellitePass,
  observer: Observer,
  satelliteUrl: string,
): string {
  const durationMinutes = Math.max(1, Math.round((pass.set.getTime() - pass.rise.getTime()) / 60_000));
  const description = [
    `Potentially visible ${satellite.name} pass.`,
    `Peak elevation: ${Math.round(pass.maxElevation)}°`,
    `Duration: ${durationMinutes} minutes`,
    `AstraScope: ${satelliteUrl}`,
    'Visibility is an estimate based on satellite illumination and local twilight.',
  ].join('\n');
  const uid = `${satellite.noradId}-${pass.rise.getTime()}@astrascope`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AstraScope//Satellite Pass//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(pass.rise)}`,
    `DTEND:${utcStamp(pass.set)}`,
    `SUMMARY:${escapeIcs(`${satellite.name} visible pass`)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(`${observer.label} (${observer.latitude.toFixed(4)}, ${observer.longitude.toFixed(4)})`)}`,
    `URL:${escapeIcs(satelliteUrl)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(`${satellite.name} pass begins in 10 minutes`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function calendarFilename(satellite: Satellite, pass: SatellitePass): string {
  const safeName = satellite.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${safeName || `norad-${satellite.noradId}`}-${pass.rise.toISOString().slice(0, 10)}.ics`;
}
