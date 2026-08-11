import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Satellite } from '@/types/satellite';
import { satellitePosition } from '@/utils/orbit';

type CameraFollowerProps = {
  satellite: Satellite | null;
  time: Date;
  mode: 'earth' | 'focus' | 'follow';
  onComplete: () => void;
  controls: RefObject<{ target: THREE.Vector3; update: () => void }>;
};

export function CameraFollower({ satellite, time, mode, onComplete, controls }: CameraFollowerProps) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const previous = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  useFrame(() => {
    if (mode === 'earth' || !satellite) {
      initialized.current = false;
      return;
    }
    target.fromArray(satellitePosition(satellite, time));
    if (mode === 'focus') {
      desired.copy(target).normalize().multiplyScalar(1.6).add(target);
      camera.position.lerp(desired, 0.08);
      controls.current?.target.lerp(target, 0.12);
      controls.current?.update();
      if (camera.position.distanceTo(desired) < 0.03) onComplete();
      return;
    }
    if (!initialized.current) {
      previous.current.copy(target);
      controls.current?.target.copy(target);
      initialized.current = true;
    } else {
      const delta = target.clone().sub(previous.current);
      camera.position.add(delta);
      controls.current?.target.copy(target);
      previous.current.copy(target);
    }
    controls.current?.update();
  });

  return null;
}
