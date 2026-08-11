import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import type { Observer, Satellite } from '@/types/satellite';
import { footprintPoints, groundTrack, observerPosition, satellitePosition } from '@/utils/orbit';

type OrbitOverlayProps = {
  satellite: Satellite | null;
  time: Date;
  observer: Observer | null;
};

export function OrbitOverlay({ satellite, time, observer }: OrbitOverlayProps) {
  const track = useMemo(() => satellite ? groundTrack(satellite, time) : [], [satellite, time]);
  const footprint = useMemo(() => satellite ? footprintPoints(satellite, time) : [], [satellite, time]);
  const subpoint = satellite ? satellitePosition(satellite, time) : null;
  const observerPoint = observer ? observerPosition(observer) : null;

  return (
    <group>
      {track.length > 1 && <Line points={track} color="#22d3ee" lineWidth={2} transparent opacity={0.9} />}
      {footprint.length > 1 && <Line points={footprint} color="#fbbf24" lineWidth={1} transparent opacity={0.75} />}
      {subpoint && <group position={subpoint}><mesh><sphereGeometry args={[0.035, 12, 12]} /><meshBasicMaterial color="#fbbf24" toneMapped={false} /></mesh>{satellite && <Html center distanceFactor={7} position={[0, 0.08, 0]}><span className="pointer-events-none whitespace-nowrap rounded-full border border-amber-400/40 bg-slate-950/90 px-2 py-1 text-[10px] font-semibold text-amber-200">{satellite.name}</span></Html>}</group>}
      {observerPoint && <mesh position={observerPoint}><sphereGeometry args={[0.025, 12, 12]} /><meshBasicMaterial color="#4ade80" toneMapped={false} /></mesh>}
    </group>
  );
}
