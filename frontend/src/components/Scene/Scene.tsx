import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Earth } from '@/components/Earth/Earth';
import { Lighting } from '@/components/Lighting/Lighting';
import { Stars } from '@/components/Stars/Stars';
import { Satellites } from '@/components/Satellites/Satellites';

export function Scene() {
  return (
    <div className="h-[560px] w-full overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl shadow-cyan-950/20">
      <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }}>
        <Lighting />
        <Stars />
        <Earth />
        <Satellites />
        <OrbitControls
          enablePan={false}
          enableZoom
          enableRotate
          minDistance={2.5}
          maxDistance={6.5}
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}
