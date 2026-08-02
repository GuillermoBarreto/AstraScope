import { Stars as DreiStars } from '@react-three/drei';

export function Stars() {
  return (
    <DreiStars
      radius={120}
      depth={60}
      count={4000}
      factor={4}
      saturation={0}
      fade
      speed={1}
    />
  );
}
