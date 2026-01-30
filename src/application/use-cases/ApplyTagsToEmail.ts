/**
 * ApplyTagsToEmail Use Case
 *
 * Manages tag application to email messages.
 * Ensures tags exist before applying them and handles tag validation.
 *
 * This use case provides a clean interface for applying tags to messages:
 * 1. Validates and ensures all specified tags exist
 * 2. Applies tags to specified message via ITagManager
 *
 * @module application/use-cases/ApplyTagsToEmail
 */

import { injectable, inject } from 'tsyringe';
import type { ITagManager } from '@/infrastructure/interfaces/ITagManager';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import { EventBus } from '@/domain/events/EventBus';
import { createTagAppliedEvent } from '@/domain/events/TagAppliedEvent';
import { createTagCreatedEvent } from '@/domain/events/TagCreatedEvent';
import { HARDCODED_TAGS, type Tag } from '../../../core/config';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration for tag application.
 */
export interface ApplyTagsConfig {
  /** Whether to create missing tags automatically (default: false) */
  createMissingTags?: boolean;
  /** Whether to replace existing tags (default: false - append tags) */
  replaceTags?: boolean;
  /** Default color for auto-created tags (if createMissingTags is true) */
  defaultColor?: string;
}

/**
 * Result of tag application.
 */
export interface ApplyTagsResult {
  /** Message ID that tags were applied to */
  messageId: string;
  /** Tags that were successfully applied */
  appliedTags: string[];
  /** Tags that were skipped (already existed or failed) */
  skippedTags: string[];
  /** Tags that were created (if createMissingTags was true) */
  createdTags: string[];
}

// ============================================================================
// Use Case Implementation
// ============================================================================

/**
 * ApplyTagsToEmail Use Case
 *
 * Provides functionality for applying tags to email messages.
 * Handles tag validation and automatic creation if configured.
 *
 * @example
 * ```typescript
 * const useCase = container.resolve<ApplyTagsToEmail>(ApplyTagsToEmail);
 * const result = await useCase.execute('12345', ['is_business', 'is_important']);
 * console.log(`Applied ${result.appliedTags.length} tags`);
 * ```
 */
@injectable()
export class ApplyTagsToEmail {
  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject('ITagManager') private readonly tagManager: ITagManager,
    @inject('ILogger') private readonly logger: ILogger,
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject('IConfigRepository') private readonly configRepository: IConfigRepository
  ) {
    this.logger.debug('✅ ApplyTagsToEmail use case initialized');
  }

  // ==========================================================================
  // Private Fields
  // ==========================================================================

  /** Flag to track if all tags (hardcoded + custom) have been ensured */
  private allTagsEnsured: boolean = false;

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Applies tags to an email message.
   *
   * @param messageId - Thunderbird message ID (as string for flexibility)
   * @param tagKeys - Tag keys to apply
   * @param config - Optional configuration for tag application
   * @returns Promise resolving to tag application result
   *
   * @throws {Error} If message ID is invalid
   * @throws {Error} If tag application fails
   *
   * @example
   * ```typescript
   * const result = await applyTagsToEmail.execute('12345', ['is_business']);
   * console.log(`Applied: ${result.appliedTags.join(', ')}`);
   * ```
   */
  async execute(
    messageId: string,
    tagKeys: string[],
    config: ApplyTagsConfig = {}
  ): Promise<ApplyTagsResult> {
    // Ensure all tags (hardcoded + custom) exist on first execution
    if (!this.allTagsEnsured) {
      await this.ensureAllTagsExist();
      this.allTagsEnsured = true;
      this.logger.info('✅ All tags (hardcoded + custom) ensured on first execution');
    }

    const { createMissingTags = false, replaceTags = false, defaultColor = '#9E9E9E' } = config;

    this.logger.info('🏷️  Applying tags to email', {
      messageId,
      tagKeys,
      config: { createMissingTags, replaceTags },
    });

    try {
      // Validate message ID
      const messageIdNum = parseInt(messageId, 10);
      if (isNaN(messageIdNum)) {
        throw new Error(`Invalid message ID: ${messageId}`);
      }

      // Validate and filter tags
      const { validTags, invalidTags, warnings } = await this.validateAndFilterTags(tagKeys);

      // Log warnings for invalid tags
      if (warnings.length > 0) {
        warnings.forEach((warning) => this.logger.warn(warning));
      }

      // Ensure all valid tags exist
      this.logger.debug('➡️  Ensuring tags exist', { tagKeys: validTags, createMissingTags });
      const { applied: ensuredTags, created: createdTags } = await this.ensureTagsExist(
        validTags,
        createMissingTags,
        defaultColor
      );
      this.logger.debug('✅ Tags ensured', { ensuredTags, createdTags });

      // Apply tags to message
      this.logger.debug('➡️  Applying tags to message');
      await this.applyTagsToMessage(messageIdNum, ensuredTags, replaceTags);
      this.logger.debug('✅ Tags applied to message');

      this.logger.info('✅ Tags applied successfully', {
        messageId,
        appliedTags: ensuredTags,
        createdTags,
      });

      // Publish TagAppliedEvent
      this.logger.debug('➡️  Publishing TagAppliedEvent');
      await this.eventBus.publish(
        createTagAppliedEvent(messageId, ensuredTags, {
          skippedTags: invalidTags,
          createdTags,
          replaceTags,
        })
      );

      return {
        messageId,
        appliedTags: ensuredTags,
        skippedTags: invalidTags,
        createdTags,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to apply tags', { messageId, tagKeys, error: errorMessage });
      throw new Error(`Failed to apply tags to message ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * Ensures tags exist in Thunderbird.
   *
   * Validates that all specified tags exist and optionally creates missing ones.
   *
   * @param tagKeys - Tag keys to ensure exist
   * @param createMissing - Whether to create missing tags (default: false)
   * @param defaultColor - Default color for auto-created tags
   * @returns Promise resolving to ensured tags and created tags
   *
   * @throws {Error} If a required tag does not exist and createMissing is false
   *
   * @example
   * ```typescript
   * const { applied, created } = await applyTagsToEmail.ensureTagsExist(
   *   ['is_business', 'is_personal'],
   *   true,
   *   '#FF0000'
   * );
   * console.log(`Created ${created.length} new tags`);
   * ```
   */
  async ensureTagsExist(
    tagKeys: string[],
    createMissing: boolean = false,
    defaultColor: string = '#9E9E9E'
  ): Promise<{ applied: string[]; created: string[] }> {
    this.logger.debug('🔍 Ensuring tags exist', { tagKeys, createMissing, defaultColor });

    const applied: string[] = [];
    const created: string[] = [];

    for (const tagKey of tagKeys) {
      try {
        this.logger.debug('➡️  Checking tag existence', { tagKey });
        const existingTag = await this.tagManager.getTag(tagKey);

        if (existingTag) {
          // Tag already exists
          this.logger.debug('✅ Tag already exists', { tagKey });
          applied.push(tagKey);
        } else if (createMissing) {
          // Create missing tag
          this.logger.info('🆕 Creating missing tag', { tagKey, color: defaultColor });

          // Generate a readable tag name from key
          const tagName = this.keyToTagName(tagKey);

          await this.tagManager.ensureTagExists(tagKey, tagName, defaultColor);
          created.push(tagKey);
          applied.push(tagKey);

          // Publish TagCreatedEvent
          this.logger.debug('➡️  Publishing TagCreatedEvent');
          await this.eventBus.publish(createTagCreatedEvent(tagKey, tagName, defaultColor));
          this.logger.debug('✅ TagCreatedEvent published');
        } else {
          // Tag does not exist and creation is disabled
          this.logger.warn('⚠️  Tag does not exist and creation is disabled', { tagKey });
          throw new Error(
            `Tag '${tagKey}' does not exist. Set createMissingTags=true to create it automatically.`
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('❌ Failed to ensure tag exists', { tagKey, error: errorMessage });
        throw error;
      }
    }

    this.logger.debug('✅ Tags ensured', { applied: applied.length, created: created.length });

    return { applied, created };
  }

  /**
   * Removes tags from an email message.
   *
   * @param messageId - Thunderbird message ID
   * @param tagKeys - Tag keys to remove
   * @returns Promise resolving when tags are removed
   *
   * @throws {Error} If message ID is invalid
   * @throws {Error} If tag removal fails
   *
   * @example
   * ```typescript
   * await applyTagsToEmail.removeTags('12345', ['is_business', 'is_personal']);
   * ```
   */
  async removeTags(messageId: string, tagKeys: string[]): Promise<void> {
    this.logger.info('🗑️  Removing tags from email', { messageId, tagKeys });

    try {
      const messageIdNum = parseInt(messageId, 10);
      if (isNaN(messageIdNum)) {
        throw new Error(`Invalid message ID: ${messageId}`);
      }

      // Get current tags on message
      this.logger.debug('➡️  Getting current tags on message');
      const currentTags = await this.getCurrentTags(messageIdNum);
      const keysToRemove = tagKeys.filter((k) => currentTags.includes(k));
      this.logger.debug('✅ Current tags retrieved', { currentTags, keysToRemove });

      if (keysToRemove.length === 0) {
        this.logger.debug('⏭️  No tags to remove', { messageId, tagKeys });
        return;
      }

      // Calculate remaining tags
      const remainingTags = currentTags.filter((k) => !keysToRemove.includes(k));
      this.logger.debug('➡️  Setting remaining tags', { remainingTags });

      // Set remaining tags
      await this.tagManager.setTagsOnMessage(messageIdNum, remainingTags);

      this.logger.info('✅ Tags removed successfully', {
        messageId,
        removedTags: keysToRemove,
        remainingTags: remainingTags.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to remove tags', { messageId, tagKeys, error: errorMessage });
      throw new Error(`Failed to remove tags from message ${messageId}: ${errorMessage}`);
    }
  }

  /**
   * Clears all tags from an email message.
   *
   * @param messageId - Thunderbird message ID
   * @returns Promise resolving when all tags are cleared
   *
   * @throws {Error} If message ID is invalid
   * @throws {Error} If tag clearing fails
   *
   * @example
   * ```typescript
   * await applyTagsToEmail.clearTags('12345');
   * ```
   */
  async clearTags(messageId: string): Promise<void> {
    this.logger.info('🧹 Clearing all tags from email', { messageId });

    try {
      const messageIdNum = parseInt(messageId, 10);
      if (isNaN(messageIdNum)) {
        throw new Error(`Invalid message ID: ${messageId}`);
      }

      this.logger.debug('➡️  Setting empty tag array');
      await this.tagManager.setTagsOnMessage(messageIdNum, []);

      this.logger.info('✅ All tags cleared', { messageId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to clear tags', { messageId, error: errorMessage });
      throw new Error(`Failed to clear tags from message ${messageId}: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Ensures all tags (hardcoded + custom) exist in Thunderbird.
   *
   * Automatically creates all tags defined in HARDCODED_TAGS and custom tags
   * from configRepository if they don't exist. This is called once on the first
   * execution to ensure the system has all required tags available.
   *
   * @private
   */
  private async ensureAllTagsExist(): Promise<void> {
    // Ensure hardcoded tags exist
    for (const [key, tagConfig] of Object.entries(HARDCODED_TAGS)) {
      try {
        await this.tagManager.ensureTagExists(key, tagConfig.name, tagConfig.color);
        this.logger.debug('Hardcoded tag ensured', { key, name: tagConfig.name });
      } catch (error) {
        this.logger.warn('Failed to ensure hardcoded tag', { key, error: String(error) });
      }
    }

    // Ensure custom tags exist
    try {
      const customTags = await this.configRepository.getCustomTags();
      this.logger.debug('Loading custom tags for initialization', { count: customTags.length });

      for (const tag of customTags) {
        try {
          await this.tagManager.ensureTagExists(tag.key, tag.name, tag.color);
          this.logger.debug('Custom tag ensured', { key: tag.key, name: tag.name });
        } catch (error) {
          this.logger.warn('Failed to ensure custom tag', { key: tag.key, error: String(error) });
        }
      }

      this.logger.info('✅ All tags initialized', {
        hardcodedCount: Object.keys(HARDCODED_TAGS).length,
        customCount: customTags.length,
      });
    } catch (error) {
      this.logger.warn('Failed to load custom tags for initialization', { error: String(error) });
    }
  }

  /**
   * Validates and filters tags against defined tags.
   *
   * Checks each tag key against hardcoded tags and custom tags.
   * Returns valid tags that are defined and invalid tags that should be discarded.
   *
   * @param tagKeys - Tag keys to validate
   * @returns Promise resolving to valid tags, invalid tags, and warning messages
   */
  private async validateAndFilterTags(tagKeys: string[]): Promise<{
    validTags: string[];
    invalidTags: string[];
    warnings: string[];
  }> {
    this.logger.debug(`[DEBUG-TagValidation] Validating ${tagKeys.length} tags from LLM`);

    const validTags: string[] = [];
    const invalidTags: string[] = [];
    const warnings: string[] = [];

    // Get custom tags from config repository
    const customTags = await this.configRepository.getCustomTags();

    // Build a set of all defined tag keys
    const hardcodedTagKeys = new Set(Object.keys(HARDCODED_TAGS));
    const customTagKeys = new Set(customTags.map((tag) => tag.key));

    for (const tagKey of tagKeys) {
      if (hardcodedTagKeys.has(tagKey)) {
        // Tag is in HARDCODED_TAGS
        validTags.push(tagKey);
      } else if (customTagKeys.has(tagKey)) {
        // Tag is in Custom Tags
        validTags.push(tagKey);
      } else {
        // Tag is not defined
        invalidTags.push(tagKey);
        warnings.push(
          `[DEBUG-TagValidation] Invalid tag '${tagKey}' - not defined in HARDCODED_TAGS or custom tags`
        );
      }
    }

    this.logger.debug(
      `[DEBUG-TagValidation] Found ${validTags.length} valid, ${invalidTags.length} invalid tags`
    );

    if (invalidTags.length > 0) {
      this.logger.debug(`[DEBUG-TagValidation] Invalid tags: ${invalidTags.join(', ')}`);
      this.logger.warn(`[WARN-TagValidation] Skipping ${invalidTags.length} undefined tags`);
    }

    return { validTags, invalidTags, warnings };
  }

  /**
   * Applies tags to a message.
   *
   * @param messageId - Message ID (as number)
   * @param tagKeys - Tag keys to apply
   * @param replaceTags - Whether to replace existing tags
   * @throws {Error} If tag application fails
   */
  private async applyTagsToMessage(
    messageId: number,
    tagKeys: string[],
    replaceTags: boolean
  ): Promise<void> {
    this.logger.debug('🔧 Applying tags to message', { messageId, tagKeys, replaceTags });

    try {
      if (replaceTags) {
        // Replace all tags
        this.logger.debug('➡️  Replacing all tags');
        await this.tagManager.setTagsOnMessage(messageId, tagKeys);
      } else {
        // Append tags to existing ones
        this.logger.debug('➡️  Appending tags to existing ones');
        const currentTags = await this.getCurrentTags(messageId);
        const newTags = [...new Set([...currentTags, ...tagKeys])];
        this.logger.debug('✅ Combined tags', { current: currentTags.length, new: newTags.length });
        await this.tagManager.setTagsOnMessage(messageId, newTags);
      }

      this.logger.debug('✅ Tags applied to message', { messageId, count: tagKeys.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('❌ Failed to apply tags to message', { messageId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Gets current tags on a message.
   *
   * Note: This is a simplified implementation. In a real implementation,
   * you would retrieve the current tags from Thunderbird via IMailReader
   * or a dedicated method in ITagManager.
   *
   * @param messageId - Message ID
   * @returns Array of tag keys currently on the message
   */
  private async getCurrentTags(messageId: number): Promise<string[]> {
    // Simplified implementation - in real code, you would:
    // 1. Call messenger.messages.get(messageId) to get message object
    // 2. Extract tags from message.tags property
    // 3. Return tag keys

    this.logger.debug('🔍 Getting current tags for message', { messageId });

    // Placeholder implementation
    // This should be replaced with actual Thunderbird API call
    return [];
  }

  /**
   * Converts a tag key to a readable tag name.
   *
   * @param key - Tag key (e.g., 'is_business')
   * @returns Tag name (e.g., 'Business')
   */
  private keyToTagName(key: string): string {
    return key
      .split(/[_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
