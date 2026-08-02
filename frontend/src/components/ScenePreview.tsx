import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';

type Satellite = {
  id: string;
  name: string;
  noradId: number;
  inclination: number;
  classification: string;
};

type ScenePreviewProps = {
  satellites: Satellite[];
  selectedSatelliteId: string | null;
  onSelectSatellite: (id: string) => void;
};

type SatellitePointProps = {
  satellite: Satellite;
  isSelected: boolean;
  onSelectSatellite: (id: string) => void;
};

function SatellitePoint({ satellite, isSelected, onSelectSatellite }: SatellitePointProps) {
  const angle = (satellite.inclination / 180) * Math.PI;
  const radius = 1.6 + (satellite.noradId % 8) * 0.04;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius * 0.35;
  const z = Math.sin(angle) * radius * 0.75;

  return (
    <mesh position={[x, y, z]} onClick={() => onSelectSatellite(satellite.id)}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshStandardMaterial
        color={isSelected ? '#f59e0b' : '#38bdf8'}
        emissive={isSelected ? '#451a03' : '#0f172a'}
      />
    </mesh>
  );
}

export function ScenePreview({ satellites, selectedSatelliteId, onSelectSatellite }: ScenePreviewProps) {
  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl shadow-cyan-950/20">
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <pointLight position={[10, 10, 10]} intensity={1.2} />
        <Stars radius={100} depth={50} count={2500} factor={4} saturation={0} fade speed={1} />
        <mesh>
          <sphereGeometry args={[1.2, 48, 48]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.7} metalness={0.1} />
        </mesh>
        {satellites.slice(0, 24).map((satellite) => (
          <SatellitePoint
            key={satellite.id}
            satellite={satellite}
            isSelected={satellite.id === selectedSatelliteId}
            onSelectSatellite={onSelectSatellite}
          />
        ))}
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.7} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-2xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-300">
        Click a marker to inspect a real object
      </div>
    </div>
  );
}
