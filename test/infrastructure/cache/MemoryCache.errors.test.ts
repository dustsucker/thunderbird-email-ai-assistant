/**
 * Unit tests for MemoryCache error observability (issue #8):
 * swallowed errors are logged at debug (with error name) and counted;
 * the counter is exposed via getErrorCount() for the MessageHandler payload.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryCache } from '../../../src/infrastructure/cache/MemoryCache';
import { sharedLogger } from '../../../src/infrastructure/logger/ConsoleLogger';

describe('MemoryCache error observability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts and logs swallowed errors, resets on clear()', async () => {
    const cache = new MemoryCache();
    const debugSpy = vi.spyOn(sharedLogger, 'debug').mockImplementation(() => {});

    // get() on a key whose hashing fails: non-string keys go through
    // TextEncoder fine, so force failure via a broken subtle instead.
    const originalSubtle = globalThis.crypto.subtle;
    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: undefined,
      configurable: true,
    });

    try {
      await expect(cache.get('k')).resolves.toBeNull();
      await cache.set('k', 1);
      expect(await cache.has('k')).toBe(false);

      expect(cache.getErrorCount()).toBeGreaterThanOrEqual(2);

      // debug logs carry the operation and an errorName field
      const loggedOps = debugSpy.mock.calls.map((c) => c[0]);
      expect(loggedOps.some((m) => m.includes('MemoryCache get failed'))).toBe(true);
      expect(loggedOps.some((m) => m.includes('MemoryCache set failed'))).toBe(true);
      expect(loggedOps.some((m) => m.includes('MemoryCache has failed'))).toBe(true);
      for (const call of debugSpy.mock.calls) {
        expect(JSON.stringify(call[1])).toContain('errorName');
      }
    } finally {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        value: originalSubtle,
        configurable: true,
      });
    }

    await cache.clear();
    expect(cache.getErrorCount()).toBe(0);
  });
});
