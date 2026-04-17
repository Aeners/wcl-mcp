const DEFAULT_MAX_SIZE = 500;

export class LRUCache<T = unknown> {
  private cache = new Map<string, T>();
  private maxSize: number;

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): void {
    // If key exists, delete to refresh position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    this.evict();
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  private evict(): void {
    while (this.cache.size > this.maxSize) {
      // Map iterates in insertion order; first key is the oldest
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
  }
}

// Singleton session cache
export const sessionCache = new LRUCache();

// Cache key builders
export function fightTableKey(reportCode: string, fightId: number, dataType: string): string {
  return `${reportCode}:${fightId}:${dataType}`;
}

export function fightListKey(reportCode: string): string {
  return `${reportCode}:fights`;
}

export function reportDiscoveryKey(name: string, realm: string, region: string): string {
  return `${name.toLowerCase()}:${realm}:${region}:reports`;
}

export function combatantKey(reportCode: string, fightId: number): string {
  return `${reportCode}:${fightId}:combatants`;
}
