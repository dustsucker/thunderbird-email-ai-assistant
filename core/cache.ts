// ============================================================================
// Legacy Cache Module - DEPRECATED
// ============================================================================
/**
 * @deprecated This module is deprecated. Import from the new location:
 *
 * - AnalysisCache: `import { AnalysisCache, analysisCache, hashEmail, simpleHash, isEmailFresh, normalizeHeaders, createCacheKey } from '@/infrastructure/cache/AnalysisCache'`
 * - Or from cache index: `import { AnalysisCache, analysisCache, ... } from '@/infrastructure/cache'`
 *
 * This file will be removed in a future version.
 */
// ============================================================================

// Re-export from new location
export {
  AnalysisCache,
  analysisCache,
  hashEmail,
  simpleHash,
  isEmailFresh,
  normalizeHeaders,
  createCacheKey,
} from '../src/infrastructure/cache/AnalysisCache';
