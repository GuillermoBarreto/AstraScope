import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Earth } from '@/components/Earth/Earth';
import { Lighting } from '@/components/Lighting/Lighting';
import { Stars } from '@/components/Stars/Stars';
import { Satellites } from '@/components/Satellites/Satellites';
import type { Satellite } from '@/types/satellite';

type SceneProps = {
  satellites: Satellite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function Scene({ satellites, selectedId, onSelect }: SceneProps) {
  return (
    <div className="relative h-[580px] w-full overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl shadow-cyan-950/20">
      <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }} dpr={[1, 1.5]}>
        <Lighting />
        <Stars />
        <Earth rotationSpeed={0.04} />
        <Satellites satellites={satellites} selectedId={selectedId} onSelect={onSelect} />
        <OrbitControls enablePan={false} minDistance={2.5} maxDistance={9} autoRotate={false} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-xs text-slate-300 backdrop-blur">
        Drag to orbit · Scroll to zoom · Click a satellite
      </div>
      <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-cyan-500/20 bg-cyan-950/60 px-3 py-1.5 text-xs text-cyan-200 backdrop-blur">
        LIVE POSITION MODE
      </div>
    </div>
  );
}
