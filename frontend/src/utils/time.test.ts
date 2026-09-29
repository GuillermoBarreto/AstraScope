import { describe, expect, it } from 'vitest';
import { formatUtcClock, freshnessLabel } from './time';

describe('formatUtcClock', () => {
  it('formats a date as a zero-padded UTC clock string', () => {
    const value = new Date(Date.UTC(2026, 8, 28, 20, 17, 5));
    expect(formatUtcClock(value)).toBe('2026-09-28 20:17:05 UTC');
  });

  it('uses UTC fields regardless of the local timezone', () => {
    const value = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(formatUtcClock(value)).toBe('2026-01-01 00:00:00 UTC');
  });
});

describe('freshnessLabel', () => {
  const now = Date.UTC(2026, 8, 28, 20, 0, 0);

  it('labels fresh timestamps in seconds, minutes, and hours', () => {
    expect(freshnessLabel(new Date(now - 30_000).toISOString(), now)).toBe('30s ago');
    expect(freshnessLabel(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m ago');
    expect(freshnessLabel(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3h ago');
  });

  it('labels timestamps older than a day in whole days', () => {
    expect(freshnessLabel(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe('2d ago');
  });

  it('clamps future timestamps to zero seconds ago', () => {
    expect(freshnessLabel(new Date(now + 60_000).toISOString(), now)).toBe('0s ago');
  });

  it('returns an empty label for missing or invalid input', () => {
    expect(freshnessLabel('', now)).toBe('');
    expect(freshnessLabel('not-a-date', now)).toBe('');
  });
});
