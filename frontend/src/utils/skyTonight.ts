import type { Observer, Satellite, SatellitePass } from '@/types/satellite';
import { predictPasses } from '@/utils/orbit';

export type SkyTonightPass = SatellitePass & { satellite: Satellite };

export function skyTonightPasses(
  satellites: Satellite[],
  observer: Observer,
  start: Date,
  limit = 6,
  predictor: (satellite: Satellite, observer: Observer, start: Date) => SatellitePass[] = predictPasses,
): SkyTonightPass[] {
  return satellites
    .flatMap((satellite) =>
      predictor(satellite, observer, start).map((pass) => ({ ...pass, satellite })),
    )
    .filter((pass) => pass.visible)
    .sort((a, b) => a.rise.getTime() - b.rise.getTime() || b.maxElevation - a.maxElevation)
    .slice(0, limit);
}
