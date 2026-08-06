import { ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
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
  const hitMeshRef = useRef<THREE.InstancedMesh>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const selectedIndex = satellites.findIndex((satellite) => satellite.id === selectedId);

  useEffect(() => {
    const mesh = meshRef.current;
    const hitMesh = hitMeshRef.current;
    if (!mesh || !hitMesh) return;
    satellites.forEach((satellite, index) => {
      const [x, y, z] = satellitePosition(satellite, time);
      dummy.position.set(x, y, z);
      const selected = index === selectedIndex;
      const hovered = index === hoveredIndex;
      dummy.scale.setScalar(selected ? 2.8 : hovered ? 1.8 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, new THREE.Color(selected ? '#fbbf24' : hovered ? '#67e8f9' : operatorColor(satellite.operator)));

      // Keep the marker visually compact while giving it a forgiving pointer target.
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      hitMesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    hitMesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [hoveredIndex, satellites, selectedIndex, time]);

  useEffect(() => {
    document.body.style.cursor = hoveredIndex === null ? '' : 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hoveredIndex]);

  const setHoveredSatellite = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHoveredIndex(event.instanceId ?? null);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId !== undefined) onSelect(satellites[event.instanceId].id);
  };

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, satellites.length]} raycast={() => null}>
        <sphereGeometry args={[0.014, 6, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={hitMeshRef}
        args={[undefined, undefined, satellites.length]}
        onClick={handleClick}
        onPointerMove={setHoveredSatellite}
        onPointerOut={() => setHoveredIndex(null)}
      >
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>
      {hoveredIndex !== null && satellites[hoveredIndex] && (
        <mesh position={satellitePosition(satellites[hoveredIndex], time)} raycast={() => null}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.7} wireframe depthWrite={false} />
        </mesh>
      )}
    </group>
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
