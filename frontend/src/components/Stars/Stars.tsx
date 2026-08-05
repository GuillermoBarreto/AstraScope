import { Stars as DreiStars } from '@react-three/drei';

export function Stars() {
  return (
    <group>
      <DreiStars radius={80} depth={35} count={3500} factor={2.4} saturation={0.2} fade speed={0.25} />
      <DreiStars radius={150} depth={80} count={5000} factor={4.5} saturation={0.55} fade speed={0.08} />
    </group>
  );
}
