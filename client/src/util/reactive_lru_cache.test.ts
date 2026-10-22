import { describe, expect, it, vi } from 'vitest';
import { ReactiveLRUCache } from './reactive_lru_cache';

describe('ReactiveLRUCache', () => {
  it('stores and retrieves items correctly', () => {
    const cache = new ReactiveLRUCache<string, number>({ max: 3 });
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.peek('b')).toBe(2);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(false);
  });

  it('notifies subscribers only when values change', () => {
    const cache = new ReactiveLRUCache<string, { value: number }>({ max: 3 });
    const listener = vi.fn();
    cache.subscribe(listener);

    const objA = { value: 1 };
    cache.set('a', objA);
    expect(listener).toHaveBeenCalledTimes(1);

    // Same reference should not notify
    cache.set('a', objA);
    expect(listener).toHaveBeenCalledTimes(1);

    // Reading should not notify
    cache.get('a');
    cache.peek('a');
    expect(listener).toHaveBeenCalledTimes(1);

    // Setting new reference notifies
    const objA2 = { value: 2 };
    cache.set('a', objA2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('handles setMany in a single notification batch', () => {
    const cache = new ReactiveLRUCache<string, number>({ max: 5 });
    const listener = vi.fn();
    cache.subscribe(listener);

    cache.setMany([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);

    // Setting same values should not notify
    cache.setMany([
      ['a', 1],
      ['b', 2],
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('evicts oldest entries when exceeding max capacity and updates snapshot', () => {
    const cache = new ReactiveLRUCache<string, number>({ max: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // 'a' should be evicted

    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);

    const snapshot = cache.getSnapshot();
    expect(snapshot.has('a')).toBe(false);
    expect(snapshot.get('b')).toBe(2);
    expect(snapshot.get('c')).toBe(3);
  });

  it('deletes entries and clears correctly with notification', () => {
    const cache = new ReactiveLRUCache<string, number>({ max: 3 });
    cache.set('a', 1);
    cache.set('b', 2);

    const listener = vi.fn();
    cache.subscribe(listener);

    expect(cache.delete('nonexistent')).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    expect(cache.delete('a')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(cache.has('a')).toBe(false);

    cache.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(cache.getSnapshot().size).toBe(0);

    // Clearing an empty cache should not notify
    cache.clear();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('provides a referentially stable snapshot when no mutations occur', () => {
    const cache = new ReactiveLRUCache<string, number>({ max: 3 });
    cache.set('a', 1);

    const snapshot1 = cache.getSnapshot();
    expect(cache.getSnapshot()).toBe(snapshot1);

    cache.get('a');
    expect(cache.getSnapshot()).toBe(snapshot1);

    cache.set('a', 1); // same value
    expect(cache.getSnapshot()).toBe(snapshot1);

    cache.set('a', 2); // new value
    const snapshot2 = cache.getSnapshot();
    expect(snapshot2).not.toBe(snapshot1);
    expect(snapshot2.get('a')).toBe(2);
  });
});
