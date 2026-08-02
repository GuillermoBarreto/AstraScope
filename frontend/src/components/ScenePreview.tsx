import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';

export function ScenePreview() {
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl shadow-cyan-950/20">
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <pointLight position={[10, 10, 10]} intensity={1.2} />
        <Stars radius={100} depth={50} count={2500} factor={4} saturation={0} fade speed={1} />
        <mesh>
          <sphereGeometry args={[1.2, 48, 48]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.7} metalness={0.1} />
        </mesh>
        <mesh position={[1.7, 0.4, 0.2]}>
          <boxGeometry args={[0.25, 0.25, 0.25]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0f172a" />
        </mesh>
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.7} />
      </Canvas>
    </div>
  );
}
