import seedrandom from 'seedrandom';

export function createSeededRandom(seed: string | number): () => number {
  return seedrandom(String(seed));
}
