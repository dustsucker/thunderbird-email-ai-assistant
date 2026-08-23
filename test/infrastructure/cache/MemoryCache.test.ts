/**
 * Unit tests for MemoryCache bounding (DW11a):
 * cache size never exceeds MAX_ENTRIES; oldest entries evicted first.
 */

import { describe, it, expect } from 'vitest';
import { MemoryCache } from '../../../src/infrastructure/cache/MemoryCache';

// ponytail: mirrors MAX_ENTRIES in MemoryCache.ts (not exported to keep ctor DI-safe)
const MAX_ENTRIES = 500;

describe('MemoryCache bounding (DW11a)', () => {
  it('never exceeds the entry cap and evicts oldest entries', async () => {
    const cache = new MemoryCache();

    for (let i = 0; i < MAX_ENTRIES + 20; i++) {
      await cache.set(`key-${i}`, i);
    }

    const stats = await cache.getStats();
    expect(stats.totalEntries).toBeLessThanOrEqual(MAX_ENTRIES);

    // Oldest keys evicted, newest still present
    expect(await cache.get('key-0')).toBeNull();
    expect(await cache.get('key-1')).toBeNull();
    expect(await cache.get(`key-${MAX_ENTRIES + 19}`)).toBe(MAX_ENTRIES + 19);
  });

  it('does not evict when at or below cap', async () => {
    const cache = new MemoryCache();
    for (let i = 0; i < 10; i++) {
      await cache.set(`k${i}`, i);
    }
    expect(await cache.get('k0')).toBe(0);
    expect(await cache.get('k9')).toBe(9);
  });
});
