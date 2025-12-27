import {
  DEFAULTS,
  HARDCODED_TAGS,
  TAG_KEY_PREFIX,
  TAG_NAME_PREFIX,
  Tag,
  CustomTags,
} from './config';
import { logger } from '../providers/utils';

declare const messenger: {
  messages: {
    tags: {
      list(): Promise<unknown[]>;
      create(key: string, tag: string, color: string): Promise<void>;
    };
  };
  storage: {
    local: {
      get(keys: { customTags?: Tag[] }): Promise<{ customTags?: Tag[] }>;
    };
  };
};

// ============================================================================
// Thunderbird WebExtension API Types
// ============================================================================

/**
 * Thunderbird message tag as returned by messenger.messages.tags.list()
 */
export interface ThunderbirdTag {
  key: string;
  tag: string;
  color: string;
  ordinal: string;
}

/**
 * Storage response containing custom tags
 */
export interface StorageCustomTags {
  customTags?: CustomTags;
}

// ============================================================================
// Type Guards for Thunderbird Tag Validation
// ============================================================================

/**
 * Type guard to check if a value is a valid ThunderbirdTag
 */
export function isThunderbirdTag(value: unknown): value is ThunderbirdTag {
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
export function isThunderbirdTagArray(value: unknown): value is ThunderbirdTag[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every(isThunderbirdTag);
}

/**
 * Type guard to check if a storage response contains valid custom tags
 */
export function isValidStorageCustomTags(value: unknown): value is StorageCustomTags {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const storage = value as Record<string, unknown>;

  if (storage.customTags !== undefined) {
    return Array.isArray(storage.customTags);
  }

  return true;
}

// ============================================================================
// Tag Management Functions
// ============================================================================

/**
 * Ensures all configured tags exist in Thunderbird.
 * Creates missing tags combining hardcoded and custom tags from storage.
 *
 * @returns Promise<void>
 */
export async function ensureTagsExist(): Promise<void> {
  try {
    const tagsToEnsure = await getAllTagConfigs();

    // Get all existing tags from Thunderbird
    const allTags = await messenger.messages.tags.list();

    if (!isThunderbirdTagArray(allTags)) {
      logger.error('Invalid tag list received from Thunderbird', { allTags });
      return;
    }

    // Create missing tags
    for (const tagToCreate of tagsToEnsure) {
      const alreadyExists = checkTagExists(allTags, tagToCreate);

      if (alreadyExists) {
        logger.debug(`Tag already exists`, { key: tagToCreate.key, name: tagToCreate.name });
        continue;
      }

      await messenger.messages.tags.create(
        TAG_KEY_PREFIX + tagToCreate.key,
        TAG_NAME_PREFIX + tagToCreate.name,
        tagToCreate.color
      );

      logger.info(`Created new tag`, { name: tagToCreate.name });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error during tag creation', { error: errorMessage });
  }
}

/**
 * Checks if a tag already exists in Thunderbird by comparing key or name.
 *
 * @param existingTags - Array of existing Thunderbird tags
 * @param tagToCheck - Tag configuration to check
 * @returns True if tag exists, false otherwise
 */
export function checkTagExists(existingTags: ThunderbirdTag[], tagToCheck: Tag): boolean {
  return existingTags.some(
    (existingTag) =>
      existingTag.key === TAG_KEY_PREFIX + tagToCheck.key ||
      existingTag.tag === TAG_NAME_PREFIX + tagToCheck.name
  );
}

/**
 * Gets all tags (hardcoded + custom) that should exist in Thunderbird.
 *
 * @returns Promise resolving to array of all tag configurations
 */
export async function getAllTagConfigs(): Promise<Tag[]> {
  try {
    const storageResult = await messenger.storage.local.get({
      customTags: DEFAULTS.customTags as Tag[],
    });

    if (!isValidStorageCustomTags(storageResult)) {
      logger.error('Invalid format for custom tags', { storageResult });
      return Object.values(HARDCODED_TAGS);
    }

    const { customTags = DEFAULTS.customTags }: { customTags?: CustomTags } = storageResult;
    const hardcoded = Object.values(HARDCODED_TAGS);
    const result: Tag[] = [...hardcoded];
    for (let i = 0; i < (customTags?.length ?? 0); i++) {
      const tag = customTags?.[i];
      if (tag) {
        result.push(tag);
      }
    }
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error getting tag configurations', { error: errorMessage });
    return Object.values(HARDCODED_TAGS);
  }
}

/**
 * Finds an existing Thunderbird tag by its configuration.
 *
 * @param existingTags - Array of existing Thunderbird tags
 * @param tagConfig - Tag configuration to find
 * @returns The existing Thunderbird tag or undefined if not found
 */
export function findThunderbirdTag(
  existingTags: ThunderbirdTag[],
  tagConfig: Tag
): ThunderbirdTag | undefined {
  return existingTags.find(
    (existingTag) =>
      existingTag.key === TAG_KEY_PREFIX + tagConfig.key ||
      existingTag.tag === TAG_NAME_PREFIX + tagConfig.name
  );
}
