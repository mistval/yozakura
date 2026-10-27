import { describe, expect, it } from 'vitest';
import { weightedRandomChoice } from './array.js';

describe('weightedRandomChoice', () => {
  it('throws an error if total weight is 0', () => {
    expect(() =>
      weightedRandomChoice([
        { value: 'a', weight: 0 },
        { value: 'b', weight: 0 },
      ])
    ).toThrowError(/Total weight is zero/);
  });

  it('selects the only item with non-zero weight', () => {
    const choice = weightedRandomChoice([
      { value: 'a', weight: 0 },
      { value: 'b', weight: 10 },
      { value: 'c', weight: 0 },
    ]);
    expect(choice).toBe('b');
  });

  it('returns an item from the pool', () => {
    const choice = weightedRandomChoice([
      { value: 'a', weight: 50 },
      { value: 'b', weight: 50 },
    ]);
    expect(['a', 'b']).toContain(choice);
  });
});
