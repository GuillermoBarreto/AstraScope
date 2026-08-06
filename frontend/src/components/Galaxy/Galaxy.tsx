import { useMemo } from 'react';
import * as THREE from 'three';

const STAR_COUNT = 4200;

// A stable pseudo-random generator keeps the galaxy unchanged between renders.
function random(seed: number) {
  let value = seed;
  return () => {
    value = Math.imul(48271, value) % 0x7fffffff;
    return (value & 0x7fffffff) / 0x7fffffff;
  };
}

export function Galaxy() {
  const geometry = useMemo(() => {
    const next = random(104729);
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const cool = new THREE.Color('#93c5fd');
    const warm = new THREE.Color('#fde68a');

    for (let index = 0; index < STAR_COUNT; index += 1) {
      const longitude = next() * Math.PI * 2;
      const latitude = (next() + next() + next() - 1.5) * 0.12;
      const radius = 55 + next() * 45;
      const offset = index * 3;
      positions[offset] = Math.cos(latitude) * Math.cos(longitude) * radius;
      positions[offset + 1] = Math.sin(latitude) * radius;
      positions[offset + 2] = Math.cos(latitude) * Math.sin(longitude) * radius;

      const color = cool.clone().lerp(warm, next() * 0.65);
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return result;
  }, []);

  return (
    <points geometry={geometry} rotation={[0.48, 0.1, -0.3]} raycast={() => null}>
      <pointsMaterial
        size={0.16}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.58}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
