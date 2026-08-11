import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Satellite } from '@/types/satellite';
import { satellitePosition } from '@/utils/orbit';

type CameraFollowerProps = {
  satellite: Satellite | null;
  time: Date;
  enabled: boolean;
  onComplete: () => void;
};

export function CameraFollower({ satellite, time, enabled, onComplete }: CameraFollowerProps) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!enabled || !satellite) return;
    target.fromArray(satellitePosition(satellite, time));
    desired.copy(target).normalize().multiplyScalar(1.6).add(target);
    camera.position.lerp(desired, 0.08);
    camera.lookAt(target);
    if (camera.position.distanceTo(desired) < 0.03) onComplete();
  });

  return null;
}
