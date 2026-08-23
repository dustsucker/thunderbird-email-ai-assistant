/**
 * Unit tests for DebugLogBuffer (DW-D5).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DebugLogBuffer,
  debugLogBuffer,
  DEBUG_LOG_BUFFER_CAP,
} from '@/infrastructure/logger/DebugLogBuffer';
import { ConsoleLogger } from '@/infrastructure/logger/ConsoleLogger';
import { logger as providerLogger } from '@/infrastructure/providers/ProviderUtils';

// ============================================================================
// Session storage mock
// ============================================================================

function installSessionStorage() {
  const store = new Map<string, unknown>();
  const session = {
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      if (typeof keys === 'string') {
        if (store.has(keys)) result[keys] = store.get(keys);
      } else if (Array.isArray(keys)) {
        for (const key of keys) if (store.has(key)) result[key] = store.get(key);
      } else if (keys && typeof keys === 'object') {
        for (const key of Object.keys(keys)) {
          result[key] = store.has(key) ? store.get(key) : (keys as Record<string, unknown>)[key];
        }
      } else {
        for (const [key, value] of store) result[key] = value;
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) store.set(key, value);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
    }),
    _store: store,
  };

  (globalThis as unknown as Record<string, unknown>).browser = { storage: { session } };
  return session;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('DebugLogBuffer', () => {
  let buffer: DebugLogBuffer;
  let session: ReturnType<typeof installSessionStorage>;

  beforeEach(() => {
    vi.useFakeTimers();
    session = installSessionStorage();
    buffer = new DebugLogBuffer();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as Record<string, unknown>).browser;
  });

  describe('ring buffer', () => {
    it('caps at 500 entries (FIFO eviction) and counts dropped', () => {
      for (let i = 0; i < DEBUG_LOG_BUFFER_CAP + 10; i++) {
        buffer.add('info', `msg-${i}`);
      }

      const entries = buffer.getEntries();
      expect(entries).toHaveLength(DEBUG_LOG_BUFFER_CAP);
      // newest-first: newest is msg-509
      expect(entries[0].msg).toBe(`msg-${DEBUG_LOG_BUFFER_CAP + 9}`);
      expect(buffer.getDroppedCount()).toBe(10);
    });

    it('returns entries newest-first with ts/level/msg/ctx', () => {
      buffer.add('debug', 'first');
      buffer.add('error', 'second', '{"err":"boom"}');

      const entries = buffer.getEntries();
      expect(entries[0].msg).toBe('second');
      expect(entries[0].level).toBe('error');
      expect(entries[0].ctx).toBe('{"err":"boom"}');
      expect(entries[1].msg).toBe('first');
      expect(typeof entries[1].ts).toBe('number');
    });
  });

  describe('logger sources', () => {
    it('captures ConsoleLogger output (module singleton)', () => {
      const before = debugLogBuffer.getEntries().length;
      const consoleLogger = new ConsoleLogger();
      vi.spyOn(console, 'debug').mockImplementation(() => undefined);

      consoleLogger.debug('from console logger', { apiKey: 'sk-secret' });

      const entries = debugLogBuffer.getEntries();
      expect(entries.length).toBe(before + 1);
      expect(entries[0].msg).toBe('from console logger');
      expect(entries[0].ctx).toContain('"apiKey":"***"'); // masked by source logger
    });

    it('captures ProviderUtils module logger output (same instance)', () => {
      const before = debugLogBuffer.getEntries().length;
      vi.spyOn(console, 'log').mockImplementation(() => undefined);

      providerLogger.info('from provider logger');

      const entries = debugLogBuffer.getEntries();
      expect(entries.length).toBe(before + 1);
      expect(entries[0].msg).toBe('from provider logger');
    });
  });

  describe('session mirror', () => {
    it('debounces writes: 2 logs within 1s → exactly 1 storage write', () => {
      buffer.add('info', 'one');
      buffer.add('info', 'two');

      // Before the throttle window elapses: no write yet
      expect(session.set).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);

      expect(session.set).toHaveBeenCalledTimes(1);
      const written = (session.set as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        debugLogs: { entries: Array<{ msg: string }>; droppedCount: number };
      };
      expect(written.debugLogs.entries.map((e) => e.msg)).toEqual(['one', 'two']);
    });

    it('restores from storage.session on init (event-page wake)', async () => {
      buffer.add('info', 'survives');
      vi.advanceTimersByTime(1000);

      const revived = new DebugLogBuffer();
      await Promise.resolve(); // let restoreFromSession microtask settle

      expect(revived.getEntries().map((e) => e.msg)).toContain('survives');
    });

    it('merges instead of clobbering entries logged before restore resolves', async () => {
      buffer.add('info', 'persisted-old');
      vi.advanceTimersByTime(1000);

      // Deferred storage.get: a fresh entry lands BEFORE restore resolves
      let resolveGet: (value: Record<string, unknown>) => void;
      const deferredGet = new Promise<Record<string, unknown>>((resolve) => {
        resolveGet = resolve;
      });
      (session.get as ReturnType<typeof vi.fn>).mockReturnValueOnce(deferredGet);

      const revived = new DebugLogBuffer();
      revived.add('error', 'fresh-before-restore');

      // Restore resolves now — the fresh entry must survive
      resolveGet!({
        debugLogs: { entries: [{ ts: 1, level: 'info', msg: 'persisted-old' }], droppedCount: 0 },
      });
      await Promise.resolve();
      await Promise.resolve();

      const msgs = revived.getEntries().map((e) => e.msg);
      // newest-first: fresh entry on top, persisted entry below
      expect(msgs).toEqual(['fresh-before-restore', 'persisted-old']);
    });

    it('no-ops storage when session storage is absent', () => {
      delete (globalThis as unknown as Record<string, unknown>).browser;
      const bare = new DebugLogBuffer();
      expect(() => bare.add('info', 'no storage')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('clears buffer, session mirror, and droppedCount', () => {
      for (let i = 0; i < DEBUG_LOG_BUFFER_CAP + 5; i++) {
        buffer.add('info', `msg-${i}`);
      }
      vi.advanceTimersByTime(1000);

      buffer.clear();

      expect(buffer.getEntries()).toEqual([]);
      expect(buffer.getDroppedCount()).toBe(0);
      expect(session.remove).toHaveBeenCalledWith('debugLogs');
      expect(session._store.has('debugLogs')).toBe(false);
    });
  });
});
