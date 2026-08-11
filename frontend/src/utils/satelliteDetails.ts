import type { OrbitClass, Satellite } from '@/types/satellite';

export function canonicalSatelliteUrl(satellite: Satellite, location = window.location): string {
  const url = new URL(location.href);
  url.searchParams.delete('view');
  url.searchParams.set('satellite', satellite.id);
  return url.toString();
}

export function formatVelocity(speedKmS: number | null): string {
  return speedKmS == null || !Number.isFinite(speedKmS)
    ? 'Not available'
    : `${speedKmS.toFixed(2)} km/s · ${Math.round(speedKmS * 3600).toLocaleString()} km/h`;
}

export function formatPeriod(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return 'Not available';
  if (minutes < 180) return `${minutes.toFixed(1)} min`;
  const totalMinutes = Math.round(minutes);
  return `${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60} min`;
}

export function fallbackKind(satellite: Satellite): OrbitClass | 'generic' {
  return satellite.orbit ?? 'generic';
}
