/**
 * Undo Tag Changes Use Case
 *
 * Provides undo functionality for tag changes made to email messages.
 * Uses TagHistoryRepository to retrieve the most recent tag change
 * and reverses the operation.
 *
 * @module application/use-cases/UndoTagChanges
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/domain/interfaces/ILogger';
import type { ITagManager } from '@/domain/interfaces/ITagManager';
import { TagHistoryRepository } from '@/infrastructure/storage/TagHistoryRepository';

// ============================================================================
// Use Case Implementation
// ============================================================================

/**
 * Use case for undoing the most recent tag changes on a message.
 *
 * Restores the tag state by:
 * 1. Removing tags that were added
 * 2. Re-adding tags that were removed
 *
 * @example
 * ```typescript
 * const undoUseCase = container.resolve<UndoTagChanges>(UndoTagChanges);
 * const success = await undoUseCase.execute('123');
 * if (success) {
 *   console.log('Tags restored to previous state');
 * }
 * ```
 */
@injectable()
export class UndoTagChanges {
  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('ITagManager') private readonly tagManager: ITagManager,
    private readonly historyRepository: TagHistoryRepository
  ) {
    this.logger.debug('UndoTagChanges use case initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Undoes the most recent tag change for a message.
   *
   * @param messageId - The message ID to undo tag changes for
   * @returns Promise resolving to true if undo was successful, false if no history exists
   *
   * @example
   * ```typescript
   * const success = await undoTagChanges.execute('123');
   * if (!success) {
   *   console.log('No history found to undo');
   * }
   * ```
   */
  async execute(messageId: string): Promise<boolean> {
    this.logger.info('Undoing tag changes', { messageId });

    const historyItem = await this.historyRepository.getLatestForMessage(messageId);
    if (!historyItem) {
      this.logger.warn('No tag history found for message', { messageId });
      return false;
    }

    try {
      const messageIdNum = parseInt(messageId, 10);
      if (isNaN(messageIdNum)) {
        throw new Error(`Invalid message ID: ${messageId}`);
      }

      // Remove tags that were added
      for (const tag of historyItem.addedTags) {
        this.logger.debug('Removing previously added tag', { messageId, tagKey: tag.key });
        await this.tagManager.removeTagFromMessage(messageIdNum, tag.key);
      }

      // Re-add tags that were removed
      for (const tag of historyItem.removedTags) {
        this.logger.debug('Re-adding previously removed tag', { messageId, tagKey: tag.key });
        await this.tagManager.addTagToMessage(messageIdNum, tag.key);
      }

      // Remove the history item after successful undo
      await this.historyRepository.removeHistoryItem(historyItem.id);

      this.logger.info('Tag changes undone successfully', {
        messageId,
        historyId: historyItem.id,
        addedTagsReversed: historyItem.addedTags.length,
        removedTagsRestored: historyItem.removedTags.length,
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to undo tag changes', {
        messageId,
        historyId: historyItem.id,
        error: errorMessage,
      });
      return false;
    }
  }
}
