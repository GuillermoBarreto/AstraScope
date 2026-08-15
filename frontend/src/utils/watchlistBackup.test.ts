import { describe, expect, it } from 'vitest';
import { createWatchlistBackup, parseWatchlistBackup } from './watchlistBackup';

describe('Watchlist backup', () => {
  it('exports a stable, versioned backup and restores available satellites', () => {
    const exported = createWatchlistBackup(
      ['iss-25544', 'hubble-20580', 'iss-25544'],
      new Date('2026-08-14T12:00:00Z'),
    );
    expect(JSON.parse(exported)).toEqual({
      app: 'AstraScope',
      version: 1,
      exportedAt: '2026-08-14T12:00:00.000Z',
      satelliteIds: ['hubble-20580', 'iss-25544'],
    });
    expect(parseWatchlistBackup(exported, new Set(['iss-25544']))).toEqual(['iss-25544']);
  });

  it('rejects unrelated or malformed files', () => {
    expect(() => parseWatchlistBackup('not json', new Set())).toThrow('not valid JSON');
    expect(() => parseWatchlistBackup('{"app":"Other"}', new Set())).toThrow('not a supported');
  });
});
