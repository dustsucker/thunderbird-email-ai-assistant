// ============================================================================
// Tag Types - Central Type Definitions
// ============================================================================
// This file is the SINGLE SOURCE OF TRUTH for all tag-related types.
// All other files should import from here, NOT define their own versions.
// ============================================================================

/**
 * Represents a single tag configuration for email classification.
 *
 * @property key - Unique identifier for the tag
 * @property name - Human-readable display name
 * @property color - Hex color code (e.g., '#FF5722')
 * @property prompt - Optional AI prompt description for classification
 * @property minConfidenceThreshold - Optional minimum confidence (0-100) to apply this tag
 */
export interface Tag {
  key: string;
  name: string;
  color: string;
  prompt?: string;
  minConfidenceThreshold?: number;
}

/**
 * Thunderbird message tag as returned by messenger.messages.tags.list().
 *
 * This represents how tags are stored in Thunderbird's internal format.
 *
 * @property key - Thunderbird's internal tag key (e.g., '$label1' or '_ma_is_scam')
 * @property tag - Display name shown in Thunderbird UI
 * @property color - Hex color code for the tag
 * @property ordinal - Sort order for tag display
 */
export interface ThunderbirdTag {
  key: string;
  tag: string;
  color: string;
  ordinal: string;
}

/**
 * Storage response containing custom tags from browser storage.
 */
export interface StorageCustomTags {
  customTags?: CustomTags;
}

/**
 * Array of custom tag configurations.
 * Uses ReadonlyArray for immutability.
 */
export type CustomTags = ReadonlyArray<Tag>;

/**
 * Hardcoded tag keys that are reserved for system use.
 */
export type HardcodedTagKey = 'is_scam' | 'spf_fail' | 'dkim_fail' | 'tagged';

/**
 * Map of hardcoded tags with their configurations.
 */
export type HardcodedTags = Record<HardcodedTagKey, Tag>;
