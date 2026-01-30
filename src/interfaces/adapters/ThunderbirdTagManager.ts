import { injectable, inject } from 'tsyringe';
import {
  ITagManager,
  ThunderbirdTag,
  TagUpdateOptions,
} from '../../infrastructure/interfaces/ITagManager';
import { ILogger } from '../../infrastructure/interfaces/ILogger';
import { IConfigRepository, ICustomTag } from '../../infrastructure/interfaces/IConfigRepository';
import { HARDCODED_TAGS, TAG_KEY_PREFIX } from '../../../core/config';

// ============================================================================
// Thunderbird WebExtension API Types
// ============================================================================

interface MessageProperties {
  tags?: string[];
}

declare const messenger: {
  messages: {
    listTags(): Promise<unknown[]>;
    tags: {
      create(key: string, tag: string, color: string): Promise<ThunderbirdTag>;
      update(key: string, updateData: { color?: string; tag?: string }): Promise<ThunderbirdTag>;
      delete(key: string): Promise<void>;
    };
    addTags(ids: number[], tags: string[]): Promise<void>;
    removeTags(ids: number[], tags: string[]): Promise<void>;
    update(id: number, properties: MessageProperties): Promise<MessageProperties>;
  };
};

// ============================================================================
// Type Guards for Thunderbird Tag Validation
// ============================================================================

/**
 * Type guard to check if a value is a valid ThunderbirdTag
 */
function isThunderbirdTag(value: unknown): value is ThunderbirdTag {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const tag = value as Partial<ThunderbirdTag>;

  return (
    typeof tag.key === 'string' &&
    tag.key.length > 0 &&
    typeof tag.tag === 'string' &&
    tag.tag.length > 0 &&
    typeof tag.color === 'string' &&
    /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(tag.color) &&
    typeof tag.ordinal === 'string'
  );
}

/**
 * Type guard to check if an array contains only valid ThunderbirdTag objects
 */
function isThunderbirdTagArray(value: unknown): value is ThunderbirdTag[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every(isThunderbirdTag);
}

// ============================================================================
// ThunderbirdTagManager Implementation
// ============================================================================

/**
 * Adapter implementation for managing Thunderbird message tags.
 *
 * Uses Thunderbird WebExtension API for tag CRUD operations and message tagging.
 * Designed for dependency injection using TSyringe.
 *
 * @example
 * ```typescript
 * const tagManager = container.resolve<ITagManager>('ThunderbirdTagManager');
 * const allTags = await tagManager.getAllTags();
 * await tagManager.ensureTagExists('mytag', 'My Tag', '#FF0000');
 * ```
 */
@injectable()
export class ThunderbirdTagManager implements ITagManager {
  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IConfigRepository') private readonly configRepository: IConfigRepository
  ) {
    this.logger.debug('ThunderbirdTagManager initialized');
  }

  // ==========================================================================
  // Dynamic Tag Key Mapping
  // ==========================================================================

  /**
   * Builds a dynamic tag key map from all known tags (hardcoded + custom).
   * Maps each tag key to its internal Thunderbird key with _ma_ prefix.
   *
   * @returns Map from tag key to internal Thunderbird key
   */
  async buildTagKeyMap(): Promise<Record<string, string>> {
    const tagKeyMap: Record<string, string> = {};

    // Add hardcoded tags
    for (const tag of Object.values(HARDCODED_TAGS)) {
      tagKeyMap[tag.key] = TAG_KEY_PREFIX + tag.key;
    }

    // Add custom tags from config repository
    try {
      const customTags: ICustomTag[] = await this.configRepository.getCustomTags();
      for (const tag of customTags) {
        tagKeyMap[tag.key] = TAG_KEY_PREFIX + tag.key;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get custom tags for tag key map', { error: errorMessage });
      // Continue with hardcoded tags only
    }

    this.logger.debug('Built dynamic tag key map', { tagCount: Object.keys(tagKeyMap).length });
    return tagKeyMap;
  }

  /**
   * Converts a single tag key to its internal Thunderbird key with _ma_ prefix.
   *
   * This method uses the dynamic tag key map for known tags (hardcoded + custom),
   * and applies the _ma_ prefix as fallback for unknown tags.
   *
   * @param key - The tag key to convert (e.g., 'is_scam', 'is_advertise', 'unknown_tag')
   * @returns The internal Thunderbird key (e.g., '_ma_is_scam', '_ma_is_advertise', '_ma_unknown_tag')
   *
   * @example
   * ```typescript
   * // Known tag (hardcoded or custom)
   * const key1 = await tagManager.convertToInternalKey('is_scam');
   * // Returns: '_ma_is_scam'
   *
   * // Unknown tag (fallback)
   * const key2 = await tagManager.convertToInternalKey('unknown_tag');
   * // Returns: '_ma_unknown_tag'
   * ```
   */
  async convertToInternalKey(key: string): Promise<string> {
    // Build dynamic tag key map
    const tagKeyMap = await this.buildTagKeyMap();

    // Check if key exists in dynamic map
    if (tagKeyMap[key]) {
      this.logger.debug('Converted tag key using dynamic map', { key, internalKey: tagKeyMap[key] });
      return tagKeyMap[key];
    }

    // Fallback: apply _ma_ prefix for unknown tags
    const internalKey = TAG_KEY_PREFIX + key;
    this.logger.debug('Converted unknown tag key using fallback prefix', { key, internalKey });
    return internalKey;
  }

  /**
   * Converts an array of tag keys to their internal Thunderbird keys with _ma_ prefix.
   *
   * This method uses convertToInternalKey() for each tag in the array, handling
   * both known tags (hardcoded + custom) and unknown tags (fallback with prefix).
   *
   * @param keys - Array of tag keys to convert (e.g., ['is_scam', 'is_advertise', 'unknown'])
   * @returns Array of internal Thunderbird keys (e.g., ['_ma_is_scam', '_ma_is_advertise', '_ma_unknown'])
   *
   * @example
   * ```typescript
   * const internalKeys = await tagManager.convertToInternalKeys(['is_scam', 'is_advertise']);
   * // Returns: ['_ma_is_scam', '_ma_is_advertise']
   *
   * // Empty array returns empty array
   * const empty = await tagManager.convertToInternalKeys([]);
   * // Returns: []
   * ```
   */
  async convertToInternalKeys(keys: string[]): Promise<string[]> {
    this.logger.debug('Converting array of tag keys to internal keys', { keys, count: keys.length });

    // Handle empty array case
    if (keys.length === 0) {
      this.logger.debug('Empty keys array, returning empty result');
      return [];
    }

    // Convert each key using the single key conversion method
    const internalKeys = await Promise.all(keys.map((key) => this.convertToInternalKey(key)));

    this.logger.debug('Converted array of tag keys to internal keys', {
      originalKeys: keys,
      internalKeys,
      count: internalKeys.length,
    });

    return internalKeys;
  }

  // ==========================================================================
  // Read Tags
  // ==========================================================================

  /**
   * @inheritdoc
   */
  async getAllTags(): Promise<ThunderbirdTag[]> {
    this.logger.debug('Fetching all tags from Thunderbird');

    try {
      const tags = await messenger.messages.listTags();

      if (!isThunderbirdTagArray(tags)) {
        this.logger.error('Invalid tag list received from Thunderbird', { tags });
        throw new Error('Invalid tag list received from Thunderbird API');
      }

      this.logger.debug(`Retrieved ${tags.length} tags`, { count: tags.length });
      return tags;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to fetch tags from Thunderbird', { error: errorMessage });
      throw new Error(`Failed to fetch tags: ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async getTag(key: string): Promise<ThunderbirdTag | undefined> {
    this.logger.debug('Fetching tag by key', { key });

    try {
      const allTags = await this.getAllTags();
      const tag = allTags.find((t) => t.key === key);

      if (tag) {
        this.logger.debug('Tag found', { key, name: tag.tag });
      } else {
        this.logger.debug('Tag not found', { key });
      }

      return tag;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to fetch tag', { key, error: errorMessage });
      throw new Error(`Failed to fetch tag '${key}': ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async getTagById(id: string): Promise<ThunderbirdTag | undefined> {
    this.logger.debug('Fetching tag by ID', { id });

    try {
      const allTags = await this.getAllTags();
      const tag = allTags.find((t) => t.key === id || t.tag === id || t.ordinal === id);

      if (tag) {
        this.logger.debug('Tag found by ID', { id, key: tag.key, name: tag.tag });
      } else {
        this.logger.debug('Tag not found by ID', { id });
      }

      return tag;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to fetch tag by ID', { id, error: errorMessage });
      throw new Error(`Failed to fetch tag by ID '${id}': ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Create/Update/Delete Tags
  // ==========================================================================

  /**
   * @inheritdoc
   */
  async createTag(name: string, color?: string, sortKey?: string): Promise<ThunderbirdTag> {
    this.logger.info('[TAG-MANAGER] Starting tag creation', { name, color, sortKey });

    if (!name || name.trim().length === 0) {
      this.logger.error('[TAG-MANAGER] Tag name is required');
      throw new Error('Tag name is required');
    }

    if (color && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
      this.logger.error('[TAG-MANAGER] Invalid color format', { color });
      throw new Error(`Invalid color format: ${color}. Must be hex color (e.g., #FF0000)`);
    }

    // Generate key from name if not provided
    const baseKey = sortKey || name.toLowerCase().replace(/\s+/g, '_');
    // Use internal key with _ma_ prefix for Thunderbird API
    const internalKey = TAG_KEY_PREFIX + baseKey;
    this.logger.info('[TAG-MANAGER] Creating tag with parameters', {
      baseKey,
      internalKey,
      name,
      color,
      sortKey,
    });

    try {
      // Check if tag already exists to avoid duplicates
      this.logger.debug('[TAG-MANAGER] Checking if tag already exists', { internalKey });
      const existingTag = await this.getTag(internalKey);
      if (existingTag) {
        this.logger.warn('[TAG-MANAGER] Tag already exists, returning existing', {
          internalKey,
          name: existingTag.tag,
        });
        return existingTag;
      }
      this.logger.debug('[TAG-MANAGER] Tag does not exist, proceeding with creation', {
        internalKey,
      });

      // Create tag with default color if not provided
      const tagColor = color || '#9E9E9E';
      this.logger.info('[TAG-MANAGER] Calling Thunderbird API messenger.messages.tags.create()', {
        internalKey,
        name,
        color: tagColor,
      });
      const createdTag = await messenger.messages.tags.create(internalKey, name, tagColor);

      this.logger.info('[TAG-MANAGER] Tag created from Thunderbird API', {
        returnedKey: createdTag.key,
        returnedName: createdTag.tag,
        returnedColor: createdTag.color,
        ordinal: createdTag.ordinal,
      });

      if (!isThunderbirdTag(createdTag)) {
        this.logger.error('[TAG-MANAGER] Invalid tag object returned from Thunderbird API', {
          createdTag,
        });
        throw new Error('Invalid tag object returned from Thunderbird API');
      }

      this.logger.info('[TAG-MANAGER] Tag created successfully', {
        baseKey,
        internalKey: createdTag.key,
        name,
        color: tagColor,
        ordinal: createdTag.ordinal,
      });
      return createdTag;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[TAG-MANAGER] Failed to create tag', {
        name,
        baseKey,
        internalKey,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to create tag '${name}': ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async updateTag(id: string, updates: TagUpdateOptions): Promise<ThunderbirdTag> {
    this.logger.info('[TAG-MANAGER] Starting tag update', { id, updates });

    try {
      // Find the tag key if ID is not a key
      this.logger.debug('[TAG-MANAGER] Looking up tag for update', { id });
      const tag = await this.getTagById(id);
      if (!tag) {
        this.logger.error('[TAG-MANAGER] Tag not found for update', { id });
        throw new Error(`Tag '${id}' not found`);
      }
      this.logger.debug('[TAG-MANAGER] Tag found for update', {
        id,
        key: tag.key,
        currentName: tag.tag,
        currentColor: tag.color,
      });

      // Prepare update data
      const updateData: { color?: string; tag?: string } = {};
      if (updates.color !== undefined) {
        if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(updates.color)) {
          this.logger.error('[TAG-MANAGER] Invalid color format for update', {
            color: updates.color,
          });
          throw new Error(
            `Invalid color format: ${updates.color}. Must be hex color (e.g., #FF0000)`
          );
        }
        updateData.color = updates.color;
      }
      if (updates.name !== undefined) {
        if (updates.name.trim().length === 0) {
          this.logger.error('[TAG-MANAGER] Tag name cannot be empty');
          throw new Error('Tag name cannot be empty');
        }
        updateData.tag = updates.name;
      }
      this.logger.debug('[TAG-MANAGER] Prepared update data', { updateData });

      // Update the tag
      this.logger.info('[TAG-MANAGER] Calling Thunderbird API messenger.messages.tags.update()', {
        key: tag.key,
        updateData,
      });
      const updatedTag = await messenger.messages.tags.update(tag.key, updateData);

      this.logger.info('[TAG-MANAGER] Tag updated from Thunderbird API', {
        key: updatedTag.key,
        name: updatedTag.tag,
        color: updatedTag.color,
        ordinal: updatedTag.ordinal,
      });

      if (!isThunderbirdTag(updatedTag)) {
        this.logger.error('[TAG-MANAGER] Invalid tag object returned from Thunderbird API', {
          updatedTag,
        });
        throw new Error('Invalid tag object returned from Thunderbird API');
      }

      this.logger.info('[TAG-MANAGER] Tag updated successfully', { key: tag.key, updates });
      return updatedTag;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[TAG-MANAGER] Failed to update tag', {
        id,
        updates,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to update tag '${id}': ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async deleteTag(id: string): Promise<void> {
    this.logger.info('[TAG-MANAGER] Starting tag deletion', { id });

    try {
      // Find the tag key if ID is not a key
      this.logger.debug('[TAG-MANAGER] Looking up tag for deletion', { id });
      const tag = await this.getTagById(id);
      if (!tag) {
        this.logger.error('[TAG-MANAGER] Tag not found for deletion', { id });
        throw new Error(`Tag '${id}' not found`);
      }
      this.logger.debug('[TAG-MANAGER] Tag found for deletion', {
        id,
        key: tag.key,
        name: tag.tag,
      });

      this.logger.info('[TAG-MANAGER] Calling Thunderbird API messenger.messages.tags.delete()', {
        key: tag.key,
      });
      await messenger.messages.tags.delete(tag.key);

      this.logger.info('[TAG-MANAGER] Tag deleted successfully', { key: tag.key, name: tag.tag });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[TAG-MANAGER] Failed to delete tag', {
        id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to delete tag '${id}': ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Tag Messages (Single)
  // ==========================================================================

  /**
   * @inheritdoc
   */
  async addTagToMessage(messageId: number, tagKey: string): Promise<void> {
    this.logger.debug('Adding tag to message', { messageId, tagKey });

    try {
      // Convert defined key to internal key (with _ma_ prefix)
      const internalKey = await this.convertToInternalKey(tagKey);

      // Verify tag exists
      const tagExists = await this.tagExists(internalKey);
      if (!tagExists) {
        throw new Error(`Tag '${tagKey}' does not exist`);
      }

      await messenger.messages.addTags([messageId], [internalKey]);
      this.logger.debug('Tag added to message', { messageId, internalKey });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to add tag to message', { messageId, tagKey, error: errorMessage });
      throw new Error(`Failed to add tag '${tagKey}' to message ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async removeTagFromMessage(messageId: number, tagKey: string): Promise<void> {
    this.logger.debug('Removing tag from message', { messageId, tagKey });

    try {
      // Convert defined key to internal key (with _ma_ prefix)
      const internalKey = await this.convertToInternalKey(tagKey);

      await messenger.messages.removeTags([messageId], [internalKey]);
      this.logger.debug('Tag removed from message', { messageId, internalKey });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to remove tag from message', {
        messageId,
        tagKey,
        error: errorMessage,
      });
      throw new Error(
        `Failed to remove tag '${tagKey}' from message ${messageId}: ${errorMessage}`
      );
    }
  }

  /**
   * @inheritdoc
   */
  async setTagsOnMessage(messageId: number, tagKeys: string[]): Promise<void> {
    this.logger.debug('Setting tags on message', { messageId, tagKeys });

    try {
      // Convert defined keys to internal keys (with _ma_ prefix)
      const internalTagKeys = await this.convertToInternalKeys(tagKeys);

      this.logger.debug('[TAG-SET] Converting to internal keys', {
        originalKeys: tagKeys,
        internalKeys: internalTagKeys,
      });

      // Validate all tags exist
      const allTags = await this.getAllTags();
      const existingKeys = new Set(allTags.map((t) => t.key));
      const invalidTags = internalTagKeys.filter((k) => !existingKeys.has(k));

      this.logger.debug('[TAG-SET] Existing tags', {
        count: allTags.length,
        keys: allTags.map((t) => t.key).join(', '),
      });
      this.logger.debug('[TAG-SET] Tags to set', {
        tagKeys: internalTagKeys,
        count: internalTagKeys.length,
      });
      this.logger.debug('[TAG-SET] Invalid tags', { invalidTags, count: invalidTags.length });

      if (invalidTags.length > 0) {
        throw new Error(`Tags do not exist: ${invalidTags.join(', ')}`);
      }

      await messenger.messages.update(messageId, { tags: internalTagKeys });
      this.logger.debug('Tags set on message', { messageId, tagKeys: internalTagKeys });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to set tags on message', {
        messageId,
        tagKeys,
        error: errorMessage,
      });
      throw new Error(`Failed to set tags on message ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async clearTagsFromMessage(messageId: number): Promise<void> {
    this.logger.debug('Clearing tags from message', { messageId });

    try {
      await messenger.messages.update(messageId, { tags: [] });
      this.logger.debug('Tags cleared from message', { messageId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to clear tags from message', { messageId, error: errorMessage });
      throw new Error(`Failed to clear tags from message ${messageId}: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Tag Validation
  // ==========================================================================

  /**
   * @inheritdoc
   */
  async tagExists(key: string): Promise<boolean> {
    this.logger.debug('Checking if tag exists', { key });

    try {
      const tag = await this.getTag(key);
      const exists = tag !== undefined;
      this.logger.debug('Tag existence check', { key, exists });
      return exists;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to check tag existence', { key, error: errorMessage });
      return false;
    }
  }

  /**
   * @inheritdoc
   */
  async ensureTagExists(key: string, name: string, color?: string): Promise<ThunderbirdTag> {
    this.logger.debug('[TAG-CREATE] Looking for tag', { key, name, color });

    try {
      // Convert defined key to internal key (with _ma_ prefix) for checking
      const internalKey = await this.convertToInternalKey(key);

      // Check if tag already exists
      const existingTag = await this.getTag(internalKey);
      if (existingTag) {
        this.logger.debug('[TAG-CREATE] Tag already exists', {
          key,
          internalKey,
          existingKey: existingTag.key,
          existingName: existingTag.tag,
        });
        return existingTag;
      }

      // Create the tag
      this.logger.debug('[TAG-CREATE] Tag not found, creating new tag', { key, name, color });
      const newTag = await this.createTag(name, color, key);
      this.logger.debug('[TAG-CREATE] Tag created result', {
        newKey: newTag.key,
        newName: newTag.tag,
      });
      this.logger.info('Tag ensured (created)', { key, name, color });
      return newTag;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to ensure tag exists', { key, name, error: errorMessage });
      throw new Error(`Failed to ensure tag '${key}' exists: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * @inheritdoc
   */
  async addTagToMessages(messageIds: number[], tagKey: string): Promise<void> {
    this.logger.debug('Adding tag to multiple messages', { messageIds: messageIds.length, tagKey });

    if (messageIds.length === 0) {
      this.logger.debug('No message IDs provided, skipping');
      return;
    }

    try {
      // Convert defined key to internal key (with _ma_ prefix)
      const internalKey = await this.convertToInternalKey(tagKey);

      // Verify tag exists
      const tagExists = await this.tagExists(internalKey);
      if (!tagExists) {
        throw new Error(`Tag '${tagKey}' does not exist`);
      }

      await messenger.messages.addTags(messageIds, [internalKey]);
      this.logger.debug('Tag added to messages', { count: messageIds.length, internalKey });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to add tag to messages', {
        count: messageIds.length,
        tagKey,
        error: errorMessage,
      });
      throw new Error(
        `Failed to add tag '${tagKey}' to ${messageIds.length} messages: ${errorMessage}`
      );
    }
  }

  /**
   * @inheritdoc
   */
  async setTagsOnMessages(messageIds: number[], tagKeys: string[]): Promise<void> {
    this.logger.debug('Setting tags on messages', { messageIds, tagKeys });

    // Convert defined keys to internal keys (with _ma_ prefix)
    const internalTagKeys = await this.convertToInternalKeys(tagKeys);

    // Validate all tags exist
    const allTags = await this.getAllTags();
    const existingKeys = new Set(allTags.map((t) => t.key));
    const invalidTags = internalTagKeys.filter((k) => !existingKeys.has(k));

    if (invalidTags.length > 0) {
      throw new Error(`Tags do not exist: ${invalidTags.join(', ')}`);
    }

    // Use update() instead of setTags() for each message
    for (const messageId of messageIds) {
      await messenger.messages.update(messageId, { tags: internalTagKeys });
    }
    this.logger.debug('Tags set on messages', {
      messageIds,
      tagKeys: internalTagKeys,
      count: messageIds.length,
    });
  }
}
