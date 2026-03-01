/**
 * Cache module exports
 * @module infrastructure/cache
 */

export { MemoryCache } from './MemoryCache';
export type { ICache, ICacheEntry, ICacheStats } from '../interfaces/ICache';

// Analysis Cache (IndexedDB-based persistent cache for LLM results)
export {
  AnalysisCache,
  analysisCache,
  hashEmail,
  simpleHash,
  isEmailFresh,
  normalizeHeaders,
  createCacheKey,
} from './AnalysisCache';
