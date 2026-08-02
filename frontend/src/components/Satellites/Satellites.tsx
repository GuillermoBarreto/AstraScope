import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

type SatelliteMarker = {
  id: string;
  name: string;
  inclination: number;
  longitude: number;
};

type SatellitesProps = {
  satellites?: SatelliteMarker[];
  radius?: number;
};

type SatelliteOrbit = {
  id: string;
  name: string;
  orbitRadius: number;
  orbitSpeed: number;
  phaseOffset: number;
  color: string;
};

const DEFAULT_SATELLITES: SatelliteMarker[] = [
  { id: 'iss', name: 'ISS', inclination: 51.6, longitude: 0 },
  { id: 'hubble', name: 'Hubble', inclination: 28.5, longitude: 45 },
  { id: 'starlink', name: 'Starlink', inclination: 53, longitude: -120 },
  { id: 'gps', name: 'GPS', inclination: 55, longitude: 90 },
];

const ORBIT_LINE_POINTS = 64;
const ORBIT_BOB = 0.05;

function buildOrbitLine(radius: number) {
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= ORBIT_LINE_POINTS; index += 1) {
    const angle = (index / ORBIT_LINE_POINTS) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }

  return new THREE.BufferGeometry().setFromPoints(points);
}

export function Satellites({ satellites = DEFAULT_SATELLITES, radius = 1.35 }: SatellitesProps) {
  const orbitalData = useMemo(() => {
    return satellites.map((satellite, index) => ({
      id: satellite.id,
      name: satellite.name,
      orbitRadius: radius + 0.12 + index * 0.025,
      orbitSpeed: 0.8 + index * 0.12,
      phaseOffset: (index / satellites.length) * Math.PI * 2,
      color: index % 2 === 0 ? '#f59e0b' : '#38bdf8',
    } satisfies SatelliteOrbit));
  }, [radius, satellites]);

  return (
    <group>
      {orbitalData.map((satellite) => (
        <OrbitingSatellite key={satellite.id} satellite={satellite} />
      ))}
    </group>
  );
}

type OrbitingSatelliteProps = {
  satellite: SatelliteOrbit;
};

function OrbitingSatellite({ satellite }: OrbitingSatelliteProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;

    const elapsed = clock.getElapsedTime();
    const angle = elapsed * satellite.orbitSpeed + satellite.phaseOffset;
    const orbitOffset = Math.sin(elapsed * 0.7 + satellite.phaseOffset) * ORBIT_BOB;

    meshRef.current.position.set(
      Math.cos(angle) * satellite.orbitRadius,
      orbitOffset,
      Math.sin(angle) * satellite.orbitRadius * 0.7,
    );
  });

  return (
    <group>
      <line>
        <bufferGeometry attach="geometry" {...buildOrbitLine(satellite.orbitRadius)} />
        <lineBasicMaterial attach="material" color="#334155" transparent opacity={0.35} />
      </line>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshBasicMaterial color={satellite.color} />
      </mesh>
    </group>
  );
}
