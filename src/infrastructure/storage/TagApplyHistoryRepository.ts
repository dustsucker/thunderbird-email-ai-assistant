/**
 * Tag Apply History Repository
 *
 * Records which message was tagged with which tags by which provider,
 * for debugging purposes in the options page. Uses messenger.storage.local
 * with a global ring buffer of MAX_TAG_APPLY_HISTORY entries.
 *
 * @module infrastructure/storage/TagApplyHistoryRepository
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/domain/interfaces/ILogger';
import type { IClock } from '@/domain/interfaces/IClock';
import type { TagApplyHistoryEntry } from '@/shared/types/TagHistory';
import { MAX_TAG_APPLY_HISTORY, TAG_APPLY_HISTORY_STORAGE_KEY } from '@/shared/types/TagHistory';
// ============================================================================
// Tag Apply History Repository
// ============================================================================

/**
 * Repository for the debug tag-apply history.
 *
 * Newest entry is kept first; when more than MAX_TAG_APPLY_HISTORY entries
 * exist, the oldest are dropped (ring buffer).
 */
@injectable()
export class TagApplyHistoryRepository {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IClock') private readonly clock: IClock
  ) {
    this.logger.debug('TagApplyHistoryRepository initialized');
  }

  /**
   * Records a tag-apply event.
   *
   * @param entry - The apply event (timestamp is added from the clock)
   */
  async record(entry: Omit<TagApplyHistoryEntry, 'timestamp'>): Promise<void> {
    const item: TagApplyHistoryEntry = { ...entry, timestamp: this.clock.now() };

    const history = await this.getHistory();
    history.unshift(item);

    const dropped = Math.max(0, history.length - MAX_TAG_APPLY_HISTORY);
    const trimmed = history.slice(0, MAX_TAG_APPLY_HISTORY);
    await messenger.storage.local.set({ [TAG_APPLY_HISTORY_STORAGE_KEY]: trimmed });

    if (dropped > 0) {
      this.logger.debug('Trimmed tag apply history', { dropped });
    }
  }

  /**
   * Gets all history entries, newest first.
   */
  async getHistory(): Promise<TagApplyHistoryEntry[]> {
    const result = await messenger.storage.local.get(TAG_APPLY_HISTORY_STORAGE_KEY);
    const history = result[TAG_APPLY_HISTORY_STORAGE_KEY];
    return Array.isArray(history) ? history : [];
  }

  /**
   * Clears all history entries.
   */
  async clearHistory(): Promise<void> {
    await messenger.storage.local.set({ [TAG_APPLY_HISTORY_STORAGE_KEY]: [] });
    this.logger.info('Tag apply history cleared');
  }
}
