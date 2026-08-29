import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CameraFollower } from '@/components/Scene/CameraFollower';
import { Earth } from '@/components/Earth/Earth';
import { ContinentLabels } from '@/components/Earth/ContinentLabels';
import { Lighting } from '@/components/Lighting/Lighting';
import { Moon } from '@/components/Moon/Moon';
import { Stars } from '@/components/Stars/Stars';
import { Galaxy } from '@/components/Galaxy/Galaxy';
import { Sun } from '@/components/Sun/Sun';
import { Satellites } from '@/components/Satellites/Satellites';
import { OrbitOverlay } from '@/components/Satellites/OrbitOverlay';
import type { Observer, Satellite } from '@/types/satellite';
import { sunScenePosition } from '@/utils/orbit';

type SceneProps = {
  satellites: Satellite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  time: Date;
  observer: Observer | null;
  simulationMode: boolean;
  cameraMode: 'earth' | 'focus' | 'follow' | 'orbit';
  onFocusComplete: () => void;
  onExitFollow: () => void;
};

export function Scene({ satellites, selectedId, onSelect, time, observer, simulationMode, cameraMode, onFocusComplete, onExitFollow }: SceneProps) {
  const selected = satellites.find((satellite) => satellite.id === selectedId) ?? null;
  const sunPosition = useMemo(() => sunScenePosition(time), [time]);
  const controls = useRef<OrbitControlsImpl>(null);
  return (
    <div aria-label="Interactive 3D view of Earth, satellites, the Sun, Moon, and Milky Way" className="orbital-scene">
      <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
        <color attach="background" args={['#01040d']} />
        <Lighting sunPosition={sunPosition} />
        <Galaxy />
        <Stars />
        <Sun time={time} />
        <Earth rotationSpeed={0} />
        <ContinentLabels />
        <Moon time={time} />
        <Satellites satellites={satellites} selectedId={selectedId} onSelect={onSelect} time={time} />
        <OrbitOverlay satellite={selected} time={time} observer={observer} />
        <CameraFollower satellite={selected} time={time} mode={cameraMode} onComplete={onFocusComplete} controls={controls} />
        <OrbitControls ref={controls} enableDamping dampingFactor={0.08} enablePan={false} minDistance={0.45} maxDistance={16} autoRotate={false} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_58%,rgba(2,6,23,0.5)_100%)]" />
      <div className="scene-instructions">
        Drag to orbit · Scroll to zoom · Hover or click a satellite
      </div>
      <div className="scene-layers" aria-label="Object marker legend">
        <span>● Active payload</span><span>◉ Selected</span><span>◆ Rocket body</span><span>· Debris</span>
      </div>
      <div className="scene-mode">
        {cameraMode === 'follow' ? 'FOLLOW MODE' : cameraMode === 'focus' ? 'FOCUSING OBJECT' : cameraMode === 'orbit' ? 'FRAMING ORBIT' : simulationMode ? 'SIMULATION MODE' : 'LIVE POSITION MODE'}
      </div>
      {cameraMode === 'follow' && <button onClick={onExitFollow} className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-950/40 focus:outline-none focus:ring-2 focus:ring-white">Exit follow</button>}
    </div>
  );
}
