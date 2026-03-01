// ============================================================================
// Tag History Types - Undo Mechanism Types
// ============================================================================
// This file defines types for the tag change history system,
// enabling undo functionality for tag modifications.
// ============================================================================

/**
 * Represents a single tag change history entry.
 *
 * @property id - Unique identifier for this history item
 * @property messageId - The message ID that was modified
 * @property timestamp - Unix timestamp in milliseconds when the change occurred
 * @property addedTags - Tags that were added during this change
 * @property removedTags - Tags that were removed during this change
 * @property previousTags - Complete tag state before the change (for full restore)
 */
export interface TagHistoryItem {
  id: string;
  messageId: string;
  timestamp: number;
  /** Tags that were added */
  addedTags: Array<{ key: string; tag: string }>;
  /** Tags that were removed */
  removedTags: Array<{ key: string; tag: string }>;
  /** Original tags before change (for full restore) */
  previousTags: Array<{ key: string; tag: string }>;
}

/**
 * Maximum number of history items to keep per message.
 * Older history items are automatically removed when this limit is exceeded.
 */
export const MAX_HISTORY_PER_MESSAGE = 10;

/**
 * Storage key for tag history in messenger.storage.local.
 */
export const TAG_HISTORY_STORAGE_KEY = 'tagHistory';
