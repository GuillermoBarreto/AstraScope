export type WatchlistBackup = {
  app: 'AstraScope';
  version: 1;
  exportedAt: string;
  satelliteIds: string[];
};

export function createWatchlistBackup(satelliteIds: string[], now = new Date()): string {
  const backup: WatchlistBackup = {
    app: 'AstraScope',
    version: 1,
    exportedAt: now.toISOString(),
    satelliteIds: [...new Set(satelliteIds)].sort(),
  };
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function parseWatchlistBackup(value: string, availableIds: Set<string>): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('This is not an AstraScope backup.');
  const backup = parsed as Partial<WatchlistBackup>;
  if (backup.app !== 'AstraScope' || backup.version !== 1 || !Array.isArray(backup.satelliteIds)) {
    throw new Error('This is not a supported AstraScope Watchlist backup.');
  }
  if (!backup.satelliteIds.every((id) => typeof id === 'string')) {
    throw new Error('The backup contains invalid satellite IDs.');
  }
  return [...new Set(backup.satelliteIds)].filter((id) => availableIds.has(id));
}
