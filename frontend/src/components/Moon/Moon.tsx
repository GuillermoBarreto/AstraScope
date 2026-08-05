import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

type MoonProps = {
  time: Date;
};

const ORBIT_RADIUS = 3.35;
const LUNAR_PERIOD_MS = 27.321661 * 24 * 60 * 60 * 1000;

export function Moon({ time }: MoonProps) {
  const position = useMemo(() => {
    const angle = (time.getTime() % LUNAR_PERIOD_MS) / LUNAR_PERIOD_MS * Math.PI * 2;
    const inclination = THREE.MathUtils.degToRad(5.14);
    return new THREE.Vector3(
      Math.cos(angle) * ORBIT_RADIUS,
      Math.sin(angle) * Math.sin(inclination) * ORBIT_RADIUS,
      Math.sin(angle) * Math.cos(inclination) * ORBIT_RADIUS,
    );
  }, [time]);

  const orbit = useMemo(() => Array.from({ length: 97 }, (_, index) => {
    const angle = index / 96 * Math.PI * 2;
    const inclination = THREE.MathUtils.degToRad(5.14);
    return new THREE.Vector3(
      Math.cos(angle) * ORBIT_RADIUS,
      Math.sin(angle) * Math.sin(inclination) * ORBIT_RADIUS,
      Math.sin(angle) * Math.cos(inclination) * ORBIT_RADIUS,
    );
  }), []);

  return (
    <group>
      <Line points={orbit} color="#64748b" transparent opacity={0.16} lineWidth={0.45} />
      <mesh position={position} castShadow>
        <sphereGeometry args={[0.22, 40, 40]} />
        <meshStandardMaterial color="#cbd5e1" roughness={1} metalness={0} />
        <pointLight color="#bfdbfe" intensity={0.16} distance={1.4} />
      </mesh>
    </group>
  );
}
