import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Earth } from '@/components/Earth/Earth';
import { ContinentLabels } from '@/components/Earth/ContinentLabels';
import { Galaxy } from '@/components/Galaxy/Galaxy';
import { Lighting } from '@/components/Lighting/Lighting';
import { Stars } from '@/components/Stars/Stars';
import type { Fireball } from '@/types/impact';

function FireballMarkers({ events, selectedId, onSelect }: { events: Fireball[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const plotted = useMemo(() => events.filter((event) => event.latitude !== null && event.longitude !== null), [events]);
  return plotted.map((event) => {
    const lat = THREE.MathUtils.degToRad(event.latitude as number);
    const lon = THREE.MathUtils.degToRad(event.longitude as number);
    const radius = 1.38;
    const position = new THREE.Vector3(radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), -radius * Math.cos(lat) * Math.sin(lon));
    const selected = event.id === selectedId;
    return (
      <mesh key={event.id} position={position} onClick={(click) => { click.stopPropagation(); onSelect(event.id); }} scale={selected ? 1.7 : 1}>
        <sphereGeometry args={[0.025, 12, 12]} />
        <meshBasicMaterial color={selected ? '#fde68a' : '#fb923c'} toneMapped={false} />
      </mesh>
    );
  });
}

export function ImpactScene({ events, selectedId, onSelect }: { events: Fireball[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div aria-label="Interactive 3D view of recent fireball locations" className="relative h-[460px] overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 sm:h-[580px]">
      <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }} dpr={[1, 1.5]}>
        <color attach="background" args={['#01040d']} />
        <Lighting sunPosition={[5, 2, 5]} />
        <Galaxy /><Stars /><Earth rotationSpeed={0} /><ContinentLabels />
        <FireballMarkers events={events} selectedId={selectedId} onSelect={onSelect} />
        <OrbitControls enableDamping dampingFactor={0.08} enablePan={false} minDistance={2.5} maxDistance={12} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-orange-400/20 bg-slate-950/80 px-4 py-2 text-xs text-orange-200">Orange markers use reported coordinates · Select a marker for details</div>
      <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-cyan-500/20 bg-cyan-950/60 px-3 py-1.5 text-xs text-cyan-200">RECENT RECONSTRUCTED EVENTS</div>
    </div>
  );
}
