import { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Satellite } from '@/types/satellite';
import { satellitePosition } from '@/utils/orbit';

type SatellitesProps = {
  satellites: Satellite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  time: Date;
};

const dummy = new THREE.Object3D();

export function Satellites({ satellites, selectedId, onSelect, time }: SatellitesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const positions = useMemo(() => satellites.slice(0, 3000), [satellites]);
  const selectedIndex = positions.findIndex((satellite) => satellite.id === selectedId);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    positions.forEach((satellite, index) => {
      const [x, y, z] = satellitePosition(satellite, time);
      dummy.position.set(x, y, z);
      const selected = index === selectedIndex;
      dummy.scale.setScalar(selected ? 2.8 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, new THREE.Color(selected ? '#fbbf24' : operatorColor(satellite.operator)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [positions, selectedIndex, time]);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId !== undefined) onSelect(positions[event.instanceId].id);
  };

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, positions.length]} onClick={handleClick}>
      <sphereGeometry args={[0.014, 6, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function operatorColor(operator: string) {
  if (operator === 'SpaceX') return '#67e8f9';
  if (operator === 'Eutelsat OneWeb') return '#a78bfa';
  if (operator === 'Amazon') return '#fb923c';
  if (operator === 'Planet') return '#4ade80';
  if (operator === 'NASA') return '#f87171';
  return '#94a3b8';
}
