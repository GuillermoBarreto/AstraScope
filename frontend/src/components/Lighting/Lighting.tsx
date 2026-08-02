type LightingProps = {
  sunPosition?: [number, number, number];
};

export function Lighting({ sunPosition = [5, 3, 2] }: LightingProps) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={sunPosition} intensity={2.2} castShadow={false} />
      <pointLight position={[-4, 2, -3]} intensity={0.4} color="#4f46e5" />
    </>
  );
}
