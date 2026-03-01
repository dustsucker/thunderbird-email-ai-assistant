// ============================================================================
// Legacy Configuration Module - DEPRECATED
// ============================================================================
/**
 * @deprecated This module is deprecated. Import from the new locations:
 *
 * - Tag types: `import type { Tag, CustomTags, HardcodedTagKey, HardcodedTags } from '@/shared/types/TagTypes'`
 * - Provider types: `import { Provider, DEFAULTS, DEFAULT_CUSTOM_TAGS, type ProviderConfig, ... } from '@/shared/types/ProviderTypes'`
 * - Tag constants: `import { TAG_KEY_PREFIX, TAG_NAME_PREFIX, HARDCODED_TAGS } from '@/shared/constants/TagConstants'`
 * - Prompt constants: `import { PROMPT_BASE } from '@/shared/constants/PromptConstants'`
 * - Validation utilities: `import { isValidProvider, isValidColor, isValidConfidenceThreshold, ... } from '@/shared/utils/validationUtils'`
 *
 * This file will be removed in a future version.
 */
// ============================================================================

// Re-export types from new locations
export type {
  Tag,
  CustomTags,
  HardcodedTagKey,
  HardcodedTags,
  ThunderbirdTag,
  StorageCustomTags,
} from '../src/shared/types/TagTypes';

export type {
  ProviderConfig,
  AnalysisLimits,
  AnalysisPrompt,
  AnalysisFeatures,
  ModelConcurrencyConfig,
  AppConfig,
  DefaultConfig,
} from '../src/shared/types/ProviderTypes';

export { Provider, DEFAULTS, DEFAULT_CUSTOM_TAGS } from '../src/shared/types/ProviderTypes';

// Re-export constants from new locations
export {
  TAG_KEY_PREFIX,
  TAG_NAME_PREFIX,
  HARDCODED_TAGS,
} from '../src/shared/constants/TagConstants';
export { PROMPT_BASE } from '../src/shared/constants/PromptConstants';

// Re-export validation utilities from new location
export {
  isValidProvider,
  isValidColor,
  isValidConfidenceThreshold,
  isHardcodedTag,
  getConcurrencyLimit,
  validateConcurrencyConfig,
  validateConfidenceThreshold,
  validateCustomTagsThresholds,
} from '../src/shared/utils/validationUtils';

// Legacy type alias (deprecated)
export type AllTags = import('../src/shared/types/TagTypes').HardcodedTags &
  import('../src/shared/types/TagTypes').CustomTags;
