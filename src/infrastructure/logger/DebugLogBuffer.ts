/**
 * DebugLogBuffer
 *
 * Ring buffer for debug log entries, capped at 500 entries (FIFO).
 * Captures entries from BOTH logger sources (ConsoleLogger and ProviderUtils
 * module logger) via the shared module-level singleton `debugLogBuffer`.
 *
 * Mirrors the buffer to `storage.session` (key 'debugLogs') with a 1000ms
 * trailing throttle so the buffer survives event-page suspend/wake.
 * `storage.session` exists since TB115 — feature-detected, no-op if absent.
 *
 * @module infrastructure/logger/DebugLogBuffer
 */

import { injectable } from 'tsyringe';

// ============================================================================
// Types
// ============================================================================

/** Log levels captured in the debug buffer. */
export type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** A single debug log entry. */
export interface DebugLogEntry {
  /** Timestamp in ms since epoch */
  ts: number;
  /** Log level */
  level: DebugLogLevel;
  /** Log message */
  msg: string;
  /** Context as JSON string (already masked by the source logger) */
  ctx?: string;
}

/** Shape persisted to storage.session. */
interface PersistedDebugLogs {
  entries: DebugLogEntry[];
  droppedCount: number;
}

interface SessionStorageApi {
  get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of entries kept (ring buffer). */
export const DEBUG_LOG_BUFFER_CAP = 500;

/** Storage key for the session mirror. */
const STORAGE_KEY = 'debugLogs';

/** Throttle window for session-mirror writes (at most one write per second). */
const WRITE_THROTTLE_MS = 1000;

// ============================================================================
// DebugLogBuffer Implementation
// ============================================================================

/**
 * Ring buffer for debug logs with session-storage mirroring.
 *
 * @example
 * ```typescript
 * import { debugLogBuffer } from '@/infrastructure/logger/DebugLogBuffer';
 * debugLogBuffer.add('info', 'something happened', '{"key":"value"}');
 * const entries = debugLogBuffer.getEntries(); // newest-first
 * ```
 */
@injectable()
export class DebugLogBuffer {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  /** Chronological entries (oldest first); newest at the end. */
  private entries: DebugLogEntry[] = [];

  /** Count of entries evicted from the ring before pickup. */
  private droppedCount = 0;

  /** Pending throttled session write. */
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Session storage API if available (feature-detected). */
  private sessionStorage: SessionStorageApi | null = null;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor() {
    this.sessionStorage = detectSessionStorage();
    void this.restoreFromSession();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Adds an entry to the buffer (evicting the oldest when over capacity)
   * and schedules a throttled session-mirror write.
   *
   * @param level - Log level
   * @param msg - Log message
   * @param ctx - Optional pre-sanitized context as JSON string
   */
  add(level: DebugLogLevel, msg: string, ctx?: string): void {
    this.entries.push({ ts: Date.now(), level, msg, ctx });

    while (this.entries.length > DEBUG_LOG_BUFFER_CAP) {
      this.entries.shift();
      this.droppedCount++;
    }

    this.scheduleWrite();
  }

  /**
   * Returns a newest-first copy of the current entries.
   *
   * @returns Entries sorted newest-first
   */
  getEntries(): DebugLogEntry[] {
    return [...this.entries].reverse();
  }

  /**
   * Returns the number of entries evicted before pickup.
   *
   * @returns Dropped entry count
   */
  getDroppedCount(): number {
    return this.droppedCount;
  }

  /**
   * Clears the buffer, the session mirror, and the dropped count.
   */
  clear(): void {
    this.entries = [];
    this.droppedCount = 0;

    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }

    void this.sessionStorage?.remove(STORAGE_KEY);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Schedules a throttled session write (at most one per second while
   * entries arrive).
   */
  private scheduleWrite(): void {
    if (this.writeTimer !== null || !this.sessionStorage) return;

    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.writeToSession();
    }, WRITE_THROTTLE_MS);
  }

  /**
   * Persists the current buffer state to storage.session.
   */
  private async writeToSession(): Promise<void> {
    try {
      await this.sessionStorage?.set({
        [STORAGE_KEY]: {
          entries: this.entries,
          droppedCount: this.droppedCount,
        } satisfies PersistedDebugLogs,
      });
    } catch {
      // Session storage is best-effort; ignore write failures
    }
  }

  /**
   * Restores the buffer from storage.session (survives event-page wake).
   */
  private async restoreFromSession(): Promise<void> {
    try {
      if (!this.sessionStorage) return;

      const result = await this.sessionStorage.get(STORAGE_KEY);
      const persisted = result[STORAGE_KEY] as PersistedDebugLogs | undefined;

      if (persisted && Array.isArray(persisted.entries)) {
        // Merge instead of replace: entries logged between construction and
        // storage.get resolution must survive the restore. Persisted entries
        // are older → prepend, then cap (newest kept, evicted count added).
        const merged = [...persisted.entries, ...this.entries];
        const evictedByCap = Math.max(0, merged.length - DEBUG_LOG_BUFFER_CAP);
        this.entries = merged.slice(-DEBUG_LOG_BUFFER_CAP);
        this.droppedCount = (persisted.droppedCount ?? 0) + evictedByCap;
      }
    } catch {
      // Session storage is best-effort; ignore restore failures
    }
  }
}

/**
 * Feature-detects browser/chrome storage.session.
 */
function detectSessionStorage(): SessionStorageApi | null {
  const globals = globalThis as unknown as {
    browser?: { storage?: { session?: SessionStorageApi } };
    chrome?: { storage?: { session?: SessionStorageApi } };
  };

  const session =
    globals.browser?.storage?.session ?? globals.chrome?.storage?.session ?? null;

  if (
    session &&
    typeof session.get === 'function' &&
    typeof session.set === 'function' &&
    typeof session.remove === 'function'
  ) {
    return session;
  }

  return null;
}

/**
 * Module-level singleton — the ONE instance shared by ConsoleLogger,
 * ProviderUtils' module logger, and the DI container.
 */
export const debugLogBuffer = new DebugLogBuffer();
