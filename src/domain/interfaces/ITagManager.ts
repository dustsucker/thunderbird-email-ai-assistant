// ============================================================================
// Domain Interface: ITagManager
// ============================================================================
// This interface defines the tag management contract for the Domain layer.
// Infrastructure layer provides concrete implementations that interact with
// Thunderbird's tag API.
//
// IMPORTANT: This is the canonical location for ITagManager.
// All layers should import from here: @/domain/interfaces/ITagManager
// ============================================================================

// Import tag types from the single source of truth
import type { ThunderbirdTag, StorageCustomTags, CustomTags } from '@/shared/types/TagTypes';

// Re-export for backward compatibility
export type { ThunderbirdTag, StorageCustomTags, CustomTags };

/**
 * Tag Manager interface for managing email tags.
 *
 * Provides methods for creating, updating, deleting, and querying tags,
 * as well as applying tags to messages.
 */
export interface ITagManager {
  /**
   * Gets all available tags.
   *
   * @returns Promise resolving to array of all Thunderbird tags
   */
  getAllTags(): Promise<ThunderbirdTag[]>;

  /**
   * Creates a new tag.
   *
   * @param name - Display name for the tag
   * @param color - Optional hex color code
   * @param sortKey - Optional sort key for ordering
   * @returns Promise resolving to the created tag
   */
  createTag(name: string, color?: string, sortKey?: string): Promise<ThunderbirdTag>;

  /**
   * Gets custom tags from storage with defaults.
   *
   * @param defaults - Default custom tags to use if none stored
   * @returns Promise resolving to storage result with custom tags
   */
  getCustomTags?(defaults: CustomTags): Promise<StorageCustomTags>;

  /**
   * Gets a tag by its key.
   *
   * @param key - Tag key to look up
   * @returns Promise resolving to tag or undefined if not found
   */
  getTag(key: string): Promise<ThunderbirdTag | undefined>;

  /**
   * Gets a tag by its ID.
   *
   * @param id - Tag ID to look up
   * @returns Promise resolving to tag or undefined if not found
   */
  getTagById(id: string): Promise<ThunderbirdTag | undefined>;

  /**
   * Updates an existing tag.
   *
   * @param id - Tag ID to update
   * @param updates - Partial tag updates to apply
   * @returns Promise resolving to updated tag
   */
  updateTag(id: string, updates: TagUpdateOptions): Promise<ThunderbirdTag>;

  /**
   * Deletes a tag.
   *
   * @param id - Tag ID to delete
   * @returns Promise resolving when deletion is complete
   */
  deleteTag(id: string): Promise<void>;

  /**
   * Checks if a tag exists.
   *
   * @param key - Tag key to check
   * @returns Promise resolving to true if tag exists
   */
  tagExists(key: string): Promise<boolean>;

  /**
   * Ensures a tag exists, creating it if necessary.
   *
   * @param key - Tag key
   * @param name - Tag display name
   * @param color - Optional hex color code
   * @returns Promise resolving to the tag (existing or created)
   */
  ensureTagExists(key: string, name: string, color?: string): Promise<ThunderbirdTag>;

  /**
   * Sets tags on a message, replacing any existing tags.
   *
   * @param messageId - Message ID to tag
   * @param tagKeys - Array of tag keys to apply
   * @returns Promise resolving when tags are set
   */
  setTagsOnMessage(messageId: number, tagKeys: string[]): Promise<void>;

  /**
   * Adds a tag to a message without removing existing tags.
   *
   * @param messageId - Message ID to tag
   * @param tagKey - Tag key to add
   * @returns Promise resolving when tag is added
   */
  addTagToMessage(messageId: number, tagKey: string): Promise<void>;

  /**
   * Removes a tag from a message.
   *
   * @param messageId - Message ID
   * @param tagKey - Tag key to remove
   * @returns Promise resolving when tag is removed
   */
  removeTagFromMessage(messageId: number, tagKey: string): Promise<void>;

  /**
   * Clears all tags from a message.
   *
   * @param messageId - Message ID to clear tags from
   * @returns Promise resolving when tags are cleared
   */
  clearTagsFromMessage(messageId: number): Promise<void>;

  /**
   * Adds a tag to multiple messages.
   *
   * @param messageIds - Array of message IDs to tag
   * @param tagKey - Tag key to add
   * @returns Promise resolving when tags are added
   */
  addTagToMessages(messageIds: number[], tagKey: string): Promise<void>;

  /**
   * Sets tags on multiple messages.
   *
   * @param messageIds - Array of message IDs to tag
   * @param tagKeys - Array of tag keys to apply
   * @returns Promise resolving when tags are set
   */
  setTagsOnMessages(messageIds: number[], tagKeys: string[]): Promise<void>;
}

/**
 * Options for updating a tag.
 */
export interface TagUpdateOptions {
  /** New display name */
  name?: string;
  /** New hex color code */
  color?: string;
}
