import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Satellite } from '@/types/satellite';
import { orbitalMetrics, satellitePosition } from '@/utils/orbit';

type CameraFollowerProps = {
  satellite: Satellite | null;
  time: Date;
  mode: 'earth' | 'focus' | 'follow' | 'orbit';
  onComplete: () => void;
  controls: RefObject<{ target: THREE.Vector3; update: () => void }>;
};

export function CameraFollower({ satellite, time, mode, onComplete, controls }: CameraFollowerProps) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const previous = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useFrame(() => {
    if (mode === 'earth' || !satellite) {
      initialized.current = false;
      return;
    }
    target.fromArray(satellitePosition(satellite, time));
    if (mode === 'focus' || mode === 'orbit') {
      if (mode === 'orbit') {
        const metrics = orbitalMetrics(satellite, time);
        const orbitRadius = 1 + Math.max(metrics.apogeeKm, metrics.perigeeKm, 0) / 6371;
        const distance = THREE.MathUtils.clamp(orbitRadius * 2.2, 3.2, 15);
        desired.copy(camera.position).normalize().multiplyScalar(distance);
        target.set(0, 0, 0);
      } else {
        desired.copy(target).normalize().multiplyScalar(1.6).add(target);
      }
      const positionAlpha = reducedMotion ? 1 : 0.09;
      const targetAlpha = reducedMotion ? 1 : 0.12;
      camera.position.lerp(desired, positionAlpha);
      controls.current?.target.lerp(target, targetAlpha);
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
