import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CameraFollower } from '@/components/Scene/CameraFollower';
import { Earth } from '@/components/Earth/Earth';
import { ContinentLabels } from '@/components/Earth/ContinentLabels';
import { Lighting } from '@/components/Lighting/Lighting';
import { Moon } from '@/components/Moon/Moon';
import { Stars } from '@/components/Stars/Stars';
import { Satellites } from '@/components/Satellites/Satellites';
import { OrbitOverlay } from '@/components/Satellites/OrbitOverlay';
import type { Observer, Satellite } from '@/types/satellite';

type SceneProps = {
  satellites: Satellite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  time: Date;
  observer: Observer | null;
  simulationMode: boolean;
  followSelected: boolean;
};

export function Scene({ satellites, selectedId, onSelect, time, observer, simulationMode, followSelected }: SceneProps) {
  const selected = satellites.find((satellite) => satellite.id === selectedId) ?? null;
  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl shadow-cyan-950/20 sm:h-[580px]">
      <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }} dpr={[1, 1.5]}>
        <color attach="background" args={['#01040d']} />
        <Lighting />
        <Stars />
        <Earth rotationSpeed={0} />
        <ContinentLabels />
        <Moon time={time} />
        <Satellites satellites={satellites} selectedId={selectedId} onSelect={onSelect} time={time} />
        <OrbitOverlay satellite={selected} time={time} observer={observer} />
        <CameraFollower satellite={selected} time={time} enabled={followSelected} />
        <OrbitControls enabled={!followSelected} enablePan={false} minDistance={2.5} maxDistance={9} autoRotate={false} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_58%,rgba(2,6,23,0.5)_100%)]" />
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-xs text-slate-300 backdrop-blur">
        Drag to orbit · Scroll to zoom · Click a satellite
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-full border border-cyan-500/20 bg-cyan-950/60 px-3 py-1.5 text-xs text-cyan-200 backdrop-blur">
        {followSelected ? 'FOLLOWING SATELLITE' : simulationMode ? 'SIMULATION MODE' : 'LIVE POSITION MODE'}
      </div>
    </div>
  );
}
