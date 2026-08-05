import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

type EarthProps = {
  radius?: number;
  rotationSpeed?: number;
};

export function Earth({ radius = 1.35, rotationSpeed = 0.15 }: EarthProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += rotationSpeed * 0.01;
    }
  });

  const texture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return loader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg');
  }, []);

  return (
    <group>
      <mesh ref={meshRef} castShadow receiveShadow>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshStandardMaterial map={texture} roughness={0.9} metalness={0.05} />
      </mesh>
      <mesh scale={1.025}>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.075} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}
