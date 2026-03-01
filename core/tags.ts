// ============================================================================
// Legacy Tag Management Module - DEPRECATED
// ============================================================================
/**
 * @deprecated This module is deprecated. Import from the new locations:
 *
 * - Tag types: `import type { Tag, CustomTags, ThunderbirdTag, StorageCustomTags } from '@/shared/types/TagTypes'`
 * - Tag constants: `import { TAG_KEY_PREFIX, TAG_NAME_PREFIX, HARDCODED_TAGS } from '@/shared/constants/TagConstants'`
 * - TagService: `import { TagService } from '@/domain/services/TagService'`
 *
 * This file will be removed in a future version.
 */
// ============================================================================

// Re-export types from new location
export type {
  Tag,
  CustomTags,
  ThunderbirdTag,
  StorageCustomTags,
} from '../src/shared/types/TagTypes';

// Re-export constants from new location
export {
  TAG_KEY_PREFIX,
  TAG_NAME_PREFIX,
  HARDCODED_TAGS,
} from '../src/shared/constants/TagConstants';

// Re-export TagService for DI usage
export { TagService } from '../src/domain/services/TagService';
