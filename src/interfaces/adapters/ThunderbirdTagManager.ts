import { injectable, inject } from 'tsyringe';
import {
  ITagManager,
  ThunderbirdTag,
  TagUpdateOptions,
} from '../../infrastructure/interfaces/ITagManager';
import { ILogger } from '../../infrastructure/interfaces/ILogger';

// ============================================================================
// Thunderbird WebExtension API Types
// ============================================================================

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
    setTags(ids: number[], tags: string[]): Promise<void>;
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

  constructor(@inject('ILogger') private readonly logger: ILogger) {
    this.logger.debug('ThunderbirdTagManager initialized');
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
    this.logger.debug('Creating new tag', { name, color, sortKey });

    if (!name || name.trim().length === 0) {
      throw new Error('Tag name is required');
    }

    if (color && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
      throw new Error(`Invalid color format: ${color}. Must be hex color (e.g., #FF0000)`);
    }

    // Generate key from name if not provided
    const key = sortKey || name.toLowerCase().replace(/\s+/g, '_');

    try {
      // Check if tag already exists to avoid duplicates
      const existingTag = await this.getTag(key);
      if (existingTag) {
        this.logger.warn('Tag already exists, returning existing', { key, name: existingTag.tag });
        return existingTag;
      }

      // Create tag with default color if not provided
      const tagColor = color || '#9E9E9E';
      const createdTag = await messenger.messages.tags.create(key, name, tagColor);

      if (!isThunderbirdTag(createdTag)) {
        throw new Error('Invalid tag object returned from Thunderbird API');
      }

      this.logger.info('Tag created successfully', { key, name, color: tagColor });
      return createdTag;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to create tag', { name, key, error: errorMessage });
      throw new Error(`Failed to create tag '${name}': ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async updateTag(id: string, updates: TagUpdateOptions): Promise<ThunderbirdTag> {
    this.logger.debug('Updating tag', { id, updates });

    try {
      // Find the tag key if ID is not a key
      const tag = await this.getTagById(id);
      if (!tag) {
        throw new Error(`Tag '${id}' not found`);
      }

      // Prepare update data
      const updateData: { color?: string; tag?: string } = {};
      if (updates.color !== undefined) {
        if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(updates.color)) {
          throw new Error(
            `Invalid color format: ${updates.color}. Must be hex color (e.g., #FF0000)`
          );
        }
        updateData.color = updates.color;
      }
      if (updates.name !== undefined) {
        if (updates.name.trim().length === 0) {
          throw new Error('Tag name cannot be empty');
        }
        updateData.tag = updates.name;
      }

      // Update the tag
      const updatedTag = await messenger.messages.tags.update(tag.key, updateData);

      if (!isThunderbirdTag(updatedTag)) {
        throw new Error('Invalid tag object returned from Thunderbird API');
      }

      this.logger.info('Tag updated successfully', { key: tag.key, updates });
      return updatedTag;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to update tag', { id, updates, error: errorMessage });
      throw new Error(`Failed to update tag '${id}': ${errorMessage}`);
    }
  }

  /**
   * @inheritdoc
   */
  async deleteTag(id: string): Promise<void> {
    this.logger.debug('Deleting tag', { id });

    try {
      // Find the tag key if ID is not a key
      const tag = await this.getTagById(id);
      if (!tag) {
        throw new Error(`Tag '${id}' not found`);
      }

      await messenger.messages.tags.delete(tag.key);
      this.logger.info('Tag deleted successfully', { key: tag.key, name: tag.tag });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to delete tag', { id, error: errorMessage });
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
      // Verify tag exists
      const tagExists = await this.tagExists(tagKey);
      if (!tagExists) {
        throw new Error(`Tag '${tagKey}' does not exist`);
      }

      await messenger.messages.addTags([messageId], [tagKey]);
      this.logger.debug('Tag added to message', { messageId, tagKey });
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
      await messenger.messages.removeTags([messageId], [tagKey]);
      this.logger.debug('Tag removed from message', { messageId, tagKey });
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
      // Validate all tags exist
      const allTags = await this.getAllTags();
      const existingKeys = new Set(allTags.map((t) => t.key));
      const invalidTags = tagKeys.filter((k) => !existingKeys.has(k));

      if (invalidTags.length > 0) {
        throw new Error(`Tags do not exist: ${invalidTags.join(', ')}`);
      }

      await messenger.messages.setTags([messageId], tagKeys);
      this.logger.debug('Tags set on message', { messageId, tagKeys });
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
      await messenger.messages.setTags([messageId], []);
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
    this.logger.debug('Ensuring tag exists', { key, name, color });

    try {
      // Check if tag already exists
      const existingTag = await this.getTag(key);
      if (existingTag) {
        this.logger.debug('Tag already exists, returning existing', { key, name: existingTag.tag });
        return existingTag;
      }

      // Create the tag
      const newTag = await this.createTag(name, color, key);
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
      // Verify tag exists
      const tagExists = await this.tagExists(tagKey);
      if (!tagExists) {
        throw new Error(`Tag '${tagKey}' does not exist`);
      }

      await messenger.messages.addTags(messageIds, [tagKey]);
      this.logger.debug('Tag added to messages', { count: messageIds.length, tagKey });
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
    this.logger.debug('Setting tags on multiple messages', {
      messageIds: messageIds.length,
      tagKeys,
    });

    if (messageIds.length === 0) {
      this.logger.debug('No message IDs provided, skipping');
      return;
    }

    try {
      // Validate all tags exist
      const allTags = await this.getAllTags();
      const existingKeys = new Set(allTags.map((t) => t.key));
      const invalidTags = tagKeys.filter((k) => !existingKeys.has(k));

      if (invalidTags.length > 0) {
        throw new Error(`Tags do not exist: ${invalidTags.join(', ')}`);
      }

      await messenger.messages.setTags(messageIds, tagKeys);
      this.logger.debug('Tags set on messages', { count: messageIds.length, tagKeys });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to set tags on messages', {
        count: messageIds.length,
        tagKeys,
        error: errorMessage,
      });
      throw new Error(`Failed to set tags on ${messageIds.length} messages: ${errorMessage}`);
    }
  }
}
