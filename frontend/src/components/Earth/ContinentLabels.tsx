import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

const CONTINENTS = [
  { name: 'North America', latitude: 42, longitude: -105 },
  { name: 'South America', latitude: -17, longitude: -60 },
  { name: 'Europe', latitude: 51, longitude: 15 },
  { name: 'Africa', latitude: 5, longitude: 20 },
  { name: 'Asia', latitude: 42, longitude: 88 },
  { name: 'Australia', latitude: -25, longitude: 134 },
  { name: 'Antarctica', latitude: -76, longitude: 20 },
] as const;

type ContinentLabelsProps = {
  radius?: number;
};

export function ContinentLabels({ radius = 1.39 }: ContinentLabelsProps) {
  const labels = useMemo(() => CONTINENTS.map((continent) => ({
    ...continent,
    position: surfacePosition(continent.latitude, continent.longitude, radius),
  })), [radius]);

  return (
    <group>
      {labels.map((continent) => (
        <Html
          key={continent.name}
          position={continent.position}
          center
          distanceFactor={5.5}
          occlude
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span className="whitespace-nowrap rounded-full border border-cyan-100/20 bg-slate-950/55 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-cyan-50/80 shadow-lg backdrop-blur-sm sm:text-[9px]">
            {continent.name}
          </span>
        </Html>
      ))}
    </group>
  );
}

function surfacePosition(latitude: number, longitude: number, radius: number): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon),
  );
}
