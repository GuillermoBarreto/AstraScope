import type { Observer, Satellite, SatellitePass } from '@/types/satellite';

const escapeIcs = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const utcStamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

function validPassDate(date: Date): boolean {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

// RFC 5545 §3.1: no content line may exceed 75 octets. Fold longer lines
// with CRLF + a single space; continuation lines carry the space, so they
// hold one octet less of content. Octets are counted, not characters, so
// non-ASCII names fold at the right place.
const MAX_ICS_LINE_OCTETS = 75;

export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = '';
  let currentOctets = 0;
  let limit = MAX_ICS_LINE_OCTETS;
  for (const char of line) {
    const charOctets = encoder.encode(char).length;
    if (currentOctets + charOctets > limit && current) {
      chunks.push(current);
      current = '';
      currentOctets = 0;
      limit = MAX_ICS_LINE_OCTETS - 1;
    }
    current += char;
    currentOctets += charOctets;
  }
  if (current) chunks.push(current);
  return chunks.join('\r\n ');
}

export function satellitePassCalendar(
  satellite: Satellite,
  pass: SatellitePass,
  observer: Observer,
  satelliteUrl: string,
): string {
  // An Invalid Date used to surface as a raw RangeError from
  // toISOString deep inside the export (issue #80); fail with a
  // message that names the problem instead.
  if (!validPassDate(pass.rise) || !validPassDate(pass.set)) {
    throw new Error('Cannot export a pass with an invalid date');
  }
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
  ].map(foldIcsLine).join('\r\n');
}

export function calendarFilename(satellite: Satellite, pass: SatellitePass): string {
  if (!validPassDate(pass.rise)) {
    throw new Error('Cannot export a pass with an invalid date');
  }
  const safeName = satellite.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${safeName || `norad-${satellite.noradId}`}-${pass.rise.toISOString().slice(0, 10)}.ics`;
}
