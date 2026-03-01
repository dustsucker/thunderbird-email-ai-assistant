// ============================================================================
// Tag Constants - Central Tag Configuration
// ============================================================================
// Migrated from core/config.ts - Single Source of Truth for tag constants
// ============================================================================

import type { HardcodedTags, Tag } from '../types/TagTypes';

// ============================================================================
// Tag Key Prefixes
// ============================================================================

/**
 * Prefix for internal Thunderbird tag keys
 * All AI-generated tags use this prefix to avoid conflicts with user tags
 */
export const TAG_KEY_PREFIX = '_ma_' as const;

/**
 * Prefix for Thunderbird tag display names
 * Makes AI-applied tags visually distinguishable in the UI
 */
export const TAG_NAME_PREFIX = 'A:' as const;

// ============================================================================
// Hardcoded Tags (System Tags)
// ============================================================================

/**
 * System-defined tags that are always available.
 * These tags have special meaning in the analysis logic.
 */
export const HARDCODED_TAGS: HardcodedTags = {
  is_scam: { key: 'is_scam', name: 'Scam Alert', color: '#FF5722' },
  spf_fail: { key: 'spf_fail', name: 'SPF Fail', color: '#E91E63' },
  dkim_fail: { key: 'dkim_fail', name: 'DKIM Fail', color: '#E91E63' },
  tagged: { key: 'tagged', name: 'Tagged', color: '#4f4f4f' },
} as const;

/**
 * Array of hardcoded tag keys for quick lookup
 */
export const HARDCODED_TAG_KEYS = Object.keys(HARDCODED_TAGS) as readonly string[];

/**
 * Get all hardcoded tags as an array
 */
export function getHardcodedTagsAsArray(): Tag[] {
  return Object.values(HARDCODED_TAGS);
}
