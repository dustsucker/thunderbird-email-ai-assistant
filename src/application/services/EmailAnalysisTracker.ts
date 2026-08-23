/**
 * EmailAnalysisTracker Service
 *
 * Tracks which emails have been analyzed by the AI to prevent duplicate analysis.
 * Uses storage.local keys (`processed_<messageId>`) as the only mechanism:
 * Thunderbird's WebExtension API has no messages.modifyPermanent(), so writing
 * analysis state into message headers is not possible.
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
      get(keys?: Record<string, unknown> | string[] | string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
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

/**
 * Storage key prefix for analysis tracking.
 * // ponytail: unbounded per-id keys in storage.local; collapse into one
 * Set under a single key if storage size ever becomes a problem.
 */
const STORAGE_KEY_PREFIX = 'processed_';

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
  // Constructor
  // ==========================================================================

  constructor(@inject('ILogger') private readonly logger: ILogger) {
    this.logger.debug('EmailAnalysisTracker service initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Checks if an email has been analyzed by reading its storage key.
   *
   * @param messageId - Thunderbird message ID
   * @returns Promise resolving to true if the email has been analyzed
   */
  async wasAnalyzed(messageId: number): Promise<boolean> {
    this.logger.debug('Checking if email was analyzed', { messageId });

    try {
      const messenger = this.getMessengerApi();
      if (!messenger) {
        throw new Error('messenger API not available');
      }

      const storageKey = this.getStorageKey(messageId);
      const result = await messenger.storage.local.get(storageKey);
      const value = result[storageKey];

      // Accept boolean true and legacy string 'true' (former fallback writes)
      const wasAnalyzed = value === true || value === 'true';

      this.logger.debug('Analysis status check complete', { messageId, wasAnalyzed });
      return wasAnalyzed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to check analysis status', { messageId, error: errorMessage });
      throw new Error(`Failed to check analysis status for message ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * Marks an email as analyzed by writing its storage key.
   *
   * @param messageId - Thunderbird message ID
   */
  async markAnalyzed(messageId: number): Promise<void> {
    this.logger.debug('Marking email as analyzed', { messageId });

    try {
      const messenger = this.getMessengerApi();
      if (!messenger) {
        throw new Error('messenger API not available');
      }

      await messenger.storage.local.set({ [this.getStorageKey(messageId)]: 'true' });
      this.logger.info('Email marked as analyzed', { messageId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to mark email as analyzed', { messageId, error: errorMessage });
      throw new Error(`Failed to mark email ${messageId} as analyzed: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

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
      (api) => typeof api?.storage?.local?.get === 'function' && typeof api.storage.local.set === 'function'
    );
  }

  /**
   * Gets the storage key for analysis tracking.
   *
   * @param messageId - Thunderbird message ID
   * @returns Storage key for the message
   */
  private getStorageKey(messageId: number): string {
    return `${STORAGE_KEY_PREFIX}${messageId}`;
  }
}
