/**
 * Tag History Repository
 *
 * Manages persistent storage of tag change history for undo functionality.
 * Uses messenger.storage.local for persistence.
 *
 * @module infrastructure/storage/TagHistoryRepository
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/domain/interfaces/ILogger';
import type { IClock } from '@/domain/interfaces/IClock';
import type { IRandom } from '@/domain/interfaces/IRandom';
import type { TagHistoryItem } from '@/shared/types/TagHistory';
import { MAX_HISTORY_PER_MESSAGE, TAG_HISTORY_STORAGE_KEY } from '@/shared/types/TagHistory';

// ============================================================================
// Tag History Repository
// ============================================================================

/**
 * Repository for managing tag change history.
 *
 * Provides CRUD operations for tag history items stored in messenger.storage.local.
 * Automatically trims old history entries when MAX_HISTORY_PER_MESSAGE is exceeded.
 *
 * @example
 * ```typescript
 * const repo = container.resolve<TagHistoryRepository>(TagHistoryRepository);
 *
 * // Record a tag change
 * await repo.recordChange('123', [{ key: 'business', tag: 'Business' }], [], []);
 *
 * // Get latest history for a message
 * const latest = await repo.getLatestForMessage('123');
 *
 * // Undo (remove the history item)
 * await repo.removeHistoryItem(latest.id);
 * ```
 */
@injectable()
export class TagHistoryRepository {
  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IClock') private readonly clock: IClock,
    @inject('IRandom') private readonly random: IRandom
  ) {
    this.logger.debug('TagHistoryRepository initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Records a tag change in history.
   *
   * Creates a new history item and stores it. Automatically trims old entries
   * for the same message if MAX_HISTORY_PER_MESSAGE is exceeded.
   *
   * @param messageId - The message ID that was modified
   * @param addedTags - Tags that were added
   * @param removedTags - Tags that were removed
   * @param previousTags - Complete tag state before the change
   * @returns Promise resolving to the created history item
   *
   * @example
   * ```typescript
   * const item = await repo.recordChange(
   *   '123',
   *   [{ key: 'business', tag: 'Business' }],
   *   [{ key: 'personal', tag: 'Personal' }],
   *   [{ key: 'personal', tag: 'Personal' }]
   * );
   * ```
   */
  async recordChange(
    messageId: string,
    addedTags: Array<{ key: string; tag: string }>,
    removedTags: Array<{ key: string; tag: string }>,
    previousTags: Array<{ key: string; tag: string }>
  ): Promise<TagHistoryItem> {
    const historyItem: TagHistoryItem = {
      id: this.random.uuid(),
      messageId,
      timestamp: this.clock.now(),
      addedTags,
      removedTags,
      previousTags,
    };

    const history = await this.getHistory();

    // Add new item at the beginning (most recent first)
    history.unshift(historyItem);

    // Trim old entries per message
    const messageHistory = history.filter((h) => h.messageId === messageId);
    if (messageHistory.length > MAX_HISTORY_PER_MESSAGE) {
      const toRemove = messageHistory.slice(MAX_HISTORY_PER_MESSAGE);
      const removeIds = new Set(toRemove.map((h) => h.id));
      const trimmedHistory = history.filter((h) => !removeIds.has(h.id));
      await this.saveHistory(trimmedHistory);
      this.logger.debug('Trimmed old history entries', {
        messageId,
        removed: toRemove.length,
      });
    } else {
      await this.saveHistory(history);
    }

    this.logger.info('Tag change recorded', { messageId, historyId: historyItem.id });
    return historyItem;
  }

  /**
   * Gets the most recent history item for a message.
   *
   * @param messageId - The message ID to look up
   * @returns Promise resolving to the latest history item or null if none exists
   *
   * @example
   * ```typescript
   * const latest = await repo.getLatestForMessage('123');
   * if (latest) {
   *   console.log('Last change:', new Date(latest.timestamp));
   * }
   * ```
   */
  async getLatestForMessage(messageId: string): Promise<TagHistoryItem | null> {
    const history = await this.getHistory();
    return history.find((h) => h.messageId === messageId) ?? null;
  }

  /**
   * Gets all history items for a message.
   *
   * @param messageId - The message ID to look up
   * @returns Promise resolving to array of history items (most recent first)
   *
   * @example
   * ```typescript
   * const history = await repo.getHistoryForMessage('123');
   * console.log(`Found ${history.length} history items`);
   * ```
   */
  async getHistoryForMessage(messageId: string): Promise<TagHistoryItem[]> {
    const history = await this.getHistory();
    return history.filter((h) => h.messageId === messageId);
  }

  /**
   * Removes a history item by ID.
   *
   * Typically called after successfully undoing a tag change.
   *
   * @param historyId - The history item ID to remove
   * @returns Promise resolving when removal is complete
   *
   * @example
   * ```typescript
   * const latest = await repo.getLatestForMessage('123');
   * if (latest) {
   *   await repo.removeHistoryItem(latest.id);
   * }
   * ```
   */
  async removeHistoryItem(historyId: string): Promise<void> {
    const history = await this.getHistory();
    const filtered = history.filter((h) => h.id !== historyId);
    await this.saveHistory(filtered);
    this.logger.debug('History item removed', { historyId });
  }

  /**
   * Clears all tag history.
   *
   * @returns Promise resolving when history is cleared
   *
   * @example
   * ```typescript
   * await repo.clearHistory();
   * ```
   */
  async clearHistory(): Promise<void> {
    await messenger.storage.local.set({ [TAG_HISTORY_STORAGE_KEY]: [] });
    this.logger.info('Tag history cleared');
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Gets all history items from storage.
   *
   * @returns Promise resolving to array of history items
   */
  private async getHistory(): Promise<TagHistoryItem[]> {
    const result = await messenger.storage.local.get(TAG_HISTORY_STORAGE_KEY);
    const history = result[TAG_HISTORY_STORAGE_KEY];
    return Array.isArray(history) ? history : [];
  }

  /**
   * Saves history items to storage.
   *
   * @param history - Array of history items to save
   */
  private async saveHistory(history: TagHistoryItem[]): Promise<void> {
    await messenger.storage.local.set({ [TAG_HISTORY_STORAGE_KEY]: history });
  }
}
