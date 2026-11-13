import { useSyncExternalStore } from 'react';
import { LRUCache } from 'lru-cache';

export class ReactiveLRUCache<K extends {}, V extends {}> {
  private readonly lru: LRUCache<K, V>;
  private readonly listeners = new Set<() => void>();
  private snapshot: ReadonlyMap<K, V> = new Map();

  constructor(options: LRUCache.Options<K, V, unknown>) {
    const originalDispose = options.dispose;

    this.lru = new LRUCache<K, V>({
      ...options,
      dispose: (value, key, reason) => {
        originalDispose?.(value, key, reason);
        // Note: When eviction occurs through set/setMany, snapshot is rebuilt there.
        // However, if eviction happens independently (e.g. TTL or external purge),
        // we ensure consistency.
      },
    });

    this.rebuildSnapshot();
  }

  private rebuildSnapshot(): void {
    const map = new Map<K, V>();
    // Iterate from oldest to newest or simply entries
    for (const [key, value] of this.lru.entries()) {
      map.set(key, value);
    }
    this.snapshot = map;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public get(key: K): V | undefined {
    return this.lru.get(key);
  }

  public peek(key: K): V | undefined {
    return this.lru.peek(key);
  }

  public has(key: K): boolean {
    return this.lru.has(key);
  }

  public set(key: K, value: V): this {
    const existing = this.lru.peek(key);
    if (Object.is(existing, value)) {
      // Just update recency in LRU without notifying or changing snapshot
      this.lru.get(key);
      return this;
    }

    this.lru.set(key, value);
    this.rebuildSnapshot();
    this.notify();
    return this;
  }

  public setMany(entries: Iterable<[K, V]>): this {
    let changed = false;
    for (const [key, value] of entries) {
      const existing = this.lru.peek(key);
      if (!Object.is(existing, value)) {
        this.lru.set(key, value);
        changed = true;
      } else {
        this.lru.get(key);
      }
    }

    if (changed) {
      this.rebuildSnapshot();
      this.notify();
    }

    return this;
  }

  public delete(key: K): boolean {
    if (!this.lru.has(key)) {
      return false;
    }

    const deleted = this.lru.delete(key);
    if (deleted) {
      this.rebuildSnapshot();
      this.notify();
    }
    return deleted;
  }

  public deleteMany(keys: Iterable<K>): boolean {
    let changed = false;
    for (const key of keys) {
      if (this.lru.delete(key)) {
        changed = true;
      }
    }

    if (changed) {
      this.rebuildSnapshot();
      this.notify();
    }
    return changed;
  }

  public clear(): void {
    if (this.lru.size === 0) {
      return;
    }
    this.lru.clear();
    this.rebuildSnapshot();
    this.notify();
  }

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public readonly getSnapshot = (): ReadonlyMap<K, V> => {
    return this.snapshot;
  };

  public useSnapshot(): ReadonlyMap<K, V> {
    return useSyncExternalStore(this.subscribe, this.getSnapshot);
  }

  public useValue(key: K | undefined): V | undefined {
    return useSyncExternalStore(this.subscribe, () => (key !== undefined ? this.peek(key) : undefined));
  }
}
