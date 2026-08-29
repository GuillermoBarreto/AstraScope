import { performance } from 'node:perf_hooks';

const sizes = [5_000, 15_000, 30_000];

for (const size of sizes) {
  const fixture = Array.from({ length: size }, (_, index) => ({
    id: `object-${index}`,
    noradId: 10_000 + index,
    name: `PUBLIC OBJECT ${index}`,
    objectType: index % 9 === 0 ? 'DEBRIS' : index % 7 === 0 ? 'ROCKET_BODY' : 'PAYLOAD',
    operationalStatus: index % 5 === 0 ? 'INACTIVE' : 'ACTIVE',
    inclination: index % 99,
    meanMotion: 1 + (index % 15),
  }));
  const serialized = JSON.stringify(fixture);
  const parseStart = performance.now();
  const parsed = JSON.parse(serialized);
  const parseMs = performance.now() - parseStart;
  const setupStart = performance.now();
  const matrices = new Float32Array(size * 16);
  const colors = new Float32Array(size * 3);
  const ids = new Map();
  for (let index = 0; index < parsed.length; index += 1) {
    matrices[index * 16] = 1;
    matrices[index * 16 + 5] = 1;
    matrices[index * 16 + 10] = 1;
    matrices[index * 16 + 15] = 1;
    colors[index * 3] = parsed[index].objectType === 'PAYLOAD' ? 0.4 : 0.5;
    ids.set(parsed[index].id, index);
  }
  const setupMs = performance.now() - setupStart;
  const interactionStart = performance.now();
  for (let index = 0; index < 2_000; index += 1) ids.get(`object-${index % size}`);
  const interactionMs = performance.now() - interactionStart;
  const typedArrayMb = (matrices.byteLength + colors.byteLength) / 1024 / 1024;
  console.log(JSON.stringify({ size, parseMs: +parseMs.toFixed(2), setupMs: +setupMs.toFixed(2), interaction2kLookupsMs: +interactionMs.toFixed(2), typedArrayMb: +typedArrayMb.toFixed(2) }));
}
