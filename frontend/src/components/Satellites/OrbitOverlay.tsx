import { Line } from '@react-three/drei';
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
      {track.length > 1 && <Line points={track} color="#22d3ee" lineWidth={1} transparent opacity={0.55} />}
      {footprint.length > 1 && <Line points={footprint} color="#fbbf24" lineWidth={1} transparent opacity={0.75} />}
      {subpoint && <mesh position={subpoint}><sphereGeometry args={[0.035, 12, 12]} /><meshBasicMaterial color="#fbbf24" toneMapped={false} /></mesh>}
      {observerPoint && <mesh position={observerPoint}><sphereGeometry args={[0.025, 12, 12]} /><meshBasicMaterial color="#4ade80" toneMapped={false} /></mesh>}
    </group>
  );
}
