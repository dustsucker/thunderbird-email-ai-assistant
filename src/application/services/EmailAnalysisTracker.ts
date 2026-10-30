/**
 * EmailAnalysisTracker Service
 *
 * Tracks which emails have been analyzed by the AI to prevent duplicate analysis.
 * Uses a single storage.local key (`processedIds`) holding a bounded LRU list of
 * numeric message IDs: Thunderbird's WebExtension API has no
 * messages.modifyPermanent(), so writing analysis state into message headers is
 * not possible.
 *
 * @module application/services/EmailAnalysisTracker
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/domain/interfaces';

// ============================================================================
// Thunderbird WebExtension API Types
// ============================================================================

interface MessengerWithStorage {
  storage: {
    local: {
      get(
        keys?: Record<string, unknown> | string[] | string | null
      ): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove?(keys: string | string[]): Promise<void>;
    };
  };
}

interface BrowserApi {
  browser?: { messenger?: MessengerWithStorage };
}

interface ChromeApi {
  chrome?: { messenger?: MessengerWithStorage };
}

interface GlobalMessengerApi {
  messenger?: MessengerWithStorage;
}

// ============================================================================
// Constants
// ============================================================================

/** Single storage key holding the tracked message IDs (JSON array). */
const STORAGE_KEY = 'processedIds';

/** Legacy per-message key prefix, migrated into STORAGE_KEY on first use. */
const LEGACY_STORAGE_KEY_PREFIX = 'processed_';

/** Upper bound of tracked IDs; oldest entries are evicted first (LRU). */
const MAX_TRACKED_IDS = 5000;

// ============================================================================
// EmailAnalysisTracker Implementation
// ============================================================================

/**
 * EmailAnalysisTracker Service
 *
 * Tracks email analysis status via storage.local.
 *
 * @example
 * ```typescript
 * const tracker = container.resolve(EmailAnalysisTracker);
 * if (!(await tracker.wasAnalyzed(12345))) {
 *   await tracker.markAnalyzed(12345);
 * }
 * ```
 */
@injectable()
export class EmailAnalysisTracker {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  /**
   * In-memory LRU of tracked IDs (insertion order = oldest first).
   * Lazily hydrated from storage on first use.
   * // ponytail: single-instance cache; external storage edits stay unseen until reload.
   */
  private processedIds: Set<number> | null = null;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(@inject('ILogger') private readonly logger: ILogger) {
    this.logger.debug('[DEBUG] EmailAnalysisTracker service initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Checks if an email has been analyzed.
   *
   * @param messageId - Thunderbird message ID
   * @returns Promise resolving to true if the email has been analyzed
   */
  async wasAnalyzed(messageId: number): Promise<boolean> {
    this.logger.debug('[DEBUG] Checking if email was analyzed', { messageId });

    try {
      const ids = await this.getProcessedIds();
      const wasAnalyzed = ids.has(messageId);

      this.logger.debug('[DEBUG] Analysis status check complete', { messageId, wasAnalyzed });
      return wasAnalyzed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[ERROR] Failed to check analysis status', {
        messageId,
        error: errorMessage,
      });
      throw new Error(`Failed to check analysis status for message ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * Marks an email as analyzed.
   *
   * @param messageId - Thunderbird message ID
   */
  async markAnalyzed(messageId: number): Promise<void> {
    this.logger.debug('[DEBUG] Marking email as analyzed', { messageId });

    try {
      const messenger = this.requireMessengerApi();
      const ids = await this.getProcessedIds();
      this.addToSet(ids, messageId);
      await this.persist(messenger, ids);
      this.logger.debug('[DEBUG] Email marked as analyzed', { messageId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[ERROR] Failed to mark email as analyzed', {
        messageId,
        error: errorMessage,
      });
      throw new Error(`Failed to mark email ${messageId} as analyzed: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Returns the in-memory tracked-ID set, hydrating (and migrating legacy
   * `processed_*` keys) from storage on first use.
   */
  private async getProcessedIds(): Promise<Set<number>> {
    if (this.processedIds) {
      return this.processedIds;
    }

    const messenger = this.requireMessengerApi();
    const result = await messenger.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];

    if (Array.isArray(stored)) {
      this.processedIds = new Set(
        stored.filter((value): value is number => typeof value === 'number')
      );
      return this.processedIds;
    }

    // First run with no consolidated key: migrate any legacy per-id keys.
    this.processedIds = new Set();
    await this.migrateLegacyKeys(messenger);
    return this.processedIds;
  }

  /**
   * Reads legacy `processed_<id>` keys once, folds them into the consolidated
   * set and removes the legacy keys.
   */
  private async migrateLegacyKeys(messenger: MessengerWithStorage): Promise<void> {
    const all = await messenger.storage.local.get(null);
    const legacyKeys: string[] = [];

    for (const key of Object.keys(all)) {
      if (!key.startsWith(LEGACY_STORAGE_KEY_PREFIX)) continue;
      legacyKeys.push(key);

      const id = Number(key.slice(LEGACY_STORAGE_KEY_PREFIX.length));
      if (!Number.isNaN(id)) {
        this.addToSet(this.processedIds!, id);
      }
    }

    if (legacyKeys.length === 0) {
      return;
    }

    await this.persist(messenger, this.processedIds!);
    await this.removeKeys(messenger, legacyKeys);
    this.logger.info('[INFO] Migrated legacy analysis tracking keys', {
      count: legacyKeys.length,
    });
  }

  /**
   * Adds an ID, evicting the oldest entries when the LRU cap is exceeded.
   */
  private addToSet(ids: Set<number>, messageId: number): void {
    if (ids.has(messageId)) {
      return;
    }
    ids.add(messageId);

    while (ids.size > MAX_TRACKED_IDS) {
      const oldest = ids.values().next().value;
      if (oldest === undefined) break;
      ids.delete(oldest);
    }
  }

  /**
   * Persists the tracked IDs as a plain JSON-serializable array.
   */
  private async persist(messenger: MessengerWithStorage, ids: Set<number>): Promise<void> {
    await messenger.storage.local.set({ [STORAGE_KEY]: [...ids] });
  }

  /**
   * Removes keys using `storage.local.remove`, the GeoThunderbird deletion API.
   * `set({ key: null })` does NOT delete keys on Gecko/Thunderbird; the fallback
   * below is only reachable on exotic runtimes lacking `remove` and is otherwise
   * dead code.
   */
  private async removeKeys(messenger: MessengerWithStorage, keys: string[]): Promise<void> {
    if (typeof messenger.storage.local.remove === 'function') {
      await messenger.storage.local.remove(keys);
      return;
    }
    const removals: Record<string, null> = {};
    for (const key of keys) {
      removals[key] = null;
    }
    await messenger.storage.local.set(removals);
  }

  /**
   * Gets the messenger API from global scope.
   *
   * The bundled background page exposes the API as a bare `messenger`
   * global (the environment TagManager successfully uses) — probe it FIRST,
   * then fall back to the browser/chrome prefixed forms. Only an API with a
   * usable storage.local.get is returned.
   *
   * @returns Messenger API or undefined if not available
   */
  private getMessengerApi(): MessengerWithStorage | undefined {
    const candidates: Array<MessengerWithStorage | undefined> = [
      (globalThis as unknown as GlobalMessengerApi).messenger,
      (globalThis as unknown as BrowserApi).browser?.messenger,
      (globalThis as unknown as ChromeApi).chrome?.messenger,
    ];

    return candidates.find(
      (api) =>
        typeof api?.storage?.local?.get === 'function' && typeof api.storage.local.set === 'function'
    );
  }

  /**
   * Gets the messenger API, throwing if unavailable.
   */
  private requireMessengerApi(): MessengerWithStorage {
    const messenger = this.getMessengerApi();
    if (!messenger) {
      throw new Error('messenger API not available');
    }
    return messenger;
  }
}
