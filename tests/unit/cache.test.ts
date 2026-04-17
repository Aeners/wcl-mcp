import { describe, it, expect } from 'vitest';
import { LRUCache } from '../../src/session/cache.js';

describe('LRUCache', () => {
  it('stores and retrieves values', () => {
    const cache = new LRUCache(10);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache(10);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts oldest entry when max size exceeded', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // Should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.size).toBe(3);
  });

  it('accessing a key refreshes its position', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a'); // Refresh 'a'
    cache.set('d', 4); // Should evict 'b' (oldest after refresh)
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('clears all entries', () => {
    const cache = new LRUCache(10);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});
