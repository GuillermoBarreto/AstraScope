import { useMemo } from 'react';
import * as THREE from 'three';
import { sunScenePosition } from '@/utils/orbit';

type SunProps = {
  time: Date;
};

export function Sun({ time }: SunProps) {
  const position = useMemo(() => sunScenePosition(time), [time]);

  return (
    <group position={position} raycast={() => null}>
      <mesh>
        <sphereGeometry args={[0.48, 32, 32]} />
        <meshBasicMaterial color="#fff7cc" toneMapped={false} />
      </mesh>
      <mesh scale={1.45}>
        <sphereGeometry args={[0.48, 24, 24]} />
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.18}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight color="#fde68a" intensity={22} distance={5} decay={1.5} />
    </group>
  );
}
