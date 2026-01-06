/**
 * IndexedDB-based cache for LLM analysis results
 * @module core/cache
 */

import { TagResponse } from '../src/infrastructure/providers/ProviderUtils';
import { logger } from '../src/infrastructure/providers/ProviderUtils';

// ============================================================================
// CACHE TYPES
// ============================================================================

/**
 * Cache entry for storing analysis results
 */
interface AnalysisCacheEntry {
  emailHash: string;
  result: TagResponse;
  timestamp: number;
  /**
   * Per-tag confidence scores (0-1 range)
   * Maps tag key to confidence score for that specific tag
   */
  tagConfidence?: Record<string, number>;
}

/**
 * Email headers for hashing
 */
type EmailHeaders = Record<string, string>;

/**
 * Cache statistics
 */
interface CacheStats {
  totalEntries: number;
  hitRate: number;
  lastCleanup?: number;
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

/**
 * IndexedDB database name
 */
const DB_NAME = 'EmailAnalysisCache';

/**
 * IndexedDB store name
 */
const STORE_NAME = 'analysisCache';

/**
 * Cache TTL in milliseconds (24 hours)
 */
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Database version
 */
const DB_VERSION = 2;

// ============================================================================
// HASH FUNCTIONS
// ============================================================================

/**
 * Hashes email content and headers to generate unique cache key
 * Uses SHA-256 for cryptographic hashing
 *
 * @param body - Email body content
 * @param headers - Email headers object
 * @returns Hex string of SHA-256 hash
 *
 * @example
 * const hash = hashEmail('Hello world', { from: 'test@example.com', subject: 'Test' });
 * // Returns: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e'
 */
export async function hashEmail(body: string, headers: EmailHeaders): Promise<string> {
  const data = body + JSON.stringify(headers);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Simple string hash for non-cryptographic use cases
 * Uses FNV-1a algorithm for fast hashing
 *
 * @param str - String to hash
 * @returns 32-bit integer hash
 *
 * @example
 * const hash = simpleHash('test');
 * // Returns: 1606244850
 */
export function simpleHash(str: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash ^ str.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

// ============================================================================
// INDEXEDDB WRAPPER
// ============================================================================

/**
 * Opens IndexedDB database and initializes schema
 *
 * @returns Promise resolving to opened database
 * @throws {Error} If database cannot be opened
 */
async function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (): void => {
      const error = request.error;
      if (error) {
        logger.error('Failed to open IndexedDB database', { error: error.message });
        reject(new Error(`Failed to open database: ${error.message}`));
      } else {
        reject(new Error('Failed to open database: Unknown error'));
      }
    };

    request.onsuccess = (): void => {
      const db = request.result;
      logger.debug('IndexedDB database opened successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent): void => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      logger.info('IndexedDB upgrade needed', { oldVersion, newVersion: DB_VERSION });

      // Create object store with emailHash as key (initial schema)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'emailHash' });

        // Create index for timestamp-based cleanup
        store.createIndex('timestamp', 'timestamp', { unique: false });

        logger.info('IndexedDB object store created', { storeName: STORE_NAME });
      }

      // Migration from version 1 to version 2: Add per-tag confidence scores
      if (oldVersion < 2) {
        logger.info('Migrating cache from v1 to v2: Adding tagConfidence field');

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.openCursor();

        getRequest.onsuccess = (cursorEvent: Event): void => {
          const cursor = (cursorEvent.target as IDBRequest).result;

          if (cursor) {
            const entry = cursor.value as AnalysisCacheEntry;

            // Add tagConfidence map populated with overall confidence for each tag
            // This is a stopgap until AI providers return per-tag confidence scores
            if (entry.result && entry.result.tags && Array.isArray(entry.result.tags)) {
              const tagConfidence: Record<string, number> = {};
              const overallConfidence = entry.result.confidence ?? 0.5;

              for (const tag of entry.result.tags) {
                tagConfidence[tag] = overallConfidence;
              }

              entry.tagConfidence = tagConfidence;

              // Update the entry with new field
              cursor.update(entry);
            }

            cursor.continue();
          } else {
            logger.info('Cache migration to v2 completed');
          }
        };

        getRequest.onerror = (): void => {
          const error = getRequest.error;
          if (error) {
            logger.error('Cache migration error', { error: error.message });
          }
        };
      }
    };
  });
}

/**
 * Executes a transaction on IndexedDB
 *
 * @param mode - Transaction mode ('readonly' or 'readwrite')
 * @param callback - Function to execute within transaction
 * @returns Promise resolving to callback result
 * @throws {Error} If transaction fails
 */
async function executeTransaction<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest | T
): Promise<T> {
  let db: IDBDatabase | null = null;

  try {
    db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], mode);
    const store = transaction.objectStore(STORE_NAME);

    return new Promise<T>((resolve, reject) => {
      const result = callback(store);

      // Handle request result (if callback returned an IDBRequest)
      if (result instanceof IDBRequest) {
        result.onsuccess = (): void => resolve(result.result as T);
        result.onerror = (): void => {
          const error = result.error;
          reject(new Error(`Transaction failed: ${error?.message || 'Unknown error'}`));
        };
      } else {
        // Handle immediate result (if callback returned a value)
        resolve(result);
      }

      transaction.onerror = (): void => {
        const error = transaction.error;
        if (error) {
          reject(new Error(`Transaction error: ${error.message}`));
        } else {
          reject(new Error('Transaction failed: Unknown error'));
        }
      };

      transaction.oncomplete = (): void => {
        logger.debug('Transaction completed successfully');
      };
    });
  } finally {
    if (db) {
      db.close();
    }
  }
}

// ============================================================================
// CACHE CLASS
// ============================================================================

/**
 * Analysis cache using IndexedDB for persistent storage
 * Implements LRU-style caching with TTL expiration
 */
export class AnalysisCache {
  private hitCount = 0;
  private missCount = 0;

  /**
   * Retrieves cached analysis result for an email
   *
   * @param emailHash - Hash of email content and headers
   * @returns Promise resolving to cached result or null if not found/expired
   *
   * @example
   * const cache = new AnalysisCache();
   * const result = await cache.get('a591a6d40...');
   * if (result) {
   *   console.log('Cache hit:', result);
   * } else {
   *   console.log('Cache miss');
   * }
   */
  async get(emailHash: string): Promise<TagResponse | null> {
    try {
      const entry = await executeTransaction<AnalysisCacheEntry | null>('readonly', (store) =>
        store.get(emailHash)
      );

      if (!entry) {
        this.missCount++;
        logger.debug('Cache miss', { emailHash });
        return null;
      }

      // Check if entry has expired
      const now = Date.now();
      const age = now - entry.timestamp;
      const isExpired = age > CACHE_TTL;

      if (isExpired) {
        this.missCount++;
        logger.debug('Cache entry expired', { emailHash, age, ttl: CACHE_TTL });

        // Delete expired entry asynchronously
        await this.delete(emailHash);

        return null;
      }

      this.hitCount++;
      logger.info('Cache hit', { emailHash, age });

      return entry.result;
    } catch (error) {
      logger.error('Failed to retrieve from cache', {
        emailHash,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Stores analysis result in cache
   *
   * @param emailHash - Hash of email content and headers
   * @param result - Analysis result to cache
   * @param tagConfidence - Optional per-tag confidence scores (0-1 range)
   * @returns Promise resolving when cache is updated
   *
   * @example
   * const cache = new AnalysisCache();
   * await cache.set('a591a6d40...', {
   *   tags: ['is_business'],
   *   confidence: 0.95,
   *   reasoning: 'Business email'
   * });
   *
   * // With per-tag confidence
   * await cache.set('a591a6d40...', {
   *   tags: ['is_business', 'is_urgent'],
   *   confidence: 0.85,
   *   reasoning: 'Business email requiring attention'
   * }, {
   *   'is_business': 0.95,
   *   'is_urgent': 0.75
   * });
   */
  async set(emailHash: string, result: TagResponse, tagConfidence?: Record<string, number>): Promise<void> {
    try {
      // Build tagConfidence map if not provided
      // Use overall confidence for each tag as a fallback
      const confidenceMap = tagConfidence ?? {};
      if (result.tags && Array.isArray(result.tags)) {
        const overallConfidence = result.confidence ?? 0.5;
        for (const tag of result.tags) {
          // Only set if not already provided (allow explicit override)
          if (!(tag in confidenceMap)) {
            confidenceMap[tag] = overallConfidence;
          }
        }
      }

      const entry: AnalysisCacheEntry = {
        emailHash,
        result,
        timestamp: Date.now(),
        tagConfidence: confidenceMap,
      };

      await executeTransaction('readwrite', (store) => store.put(entry));

      logger.info('Cache entry stored', { emailHash, tagCount: result.tags?.length ?? 0 });
    } catch (error) {
      logger.error('Failed to store in cache', {
        emailHash,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Deletes specific entry from cache
   *
   * @param emailHash - Hash of email to delete
   * @returns Promise resolving when entry is deleted
   */
  async delete(emailHash: string): Promise<void> {
    try {
      await executeTransaction('readwrite', (store) => store.delete(emailHash));

      logger.debug('Cache entry deleted', { emailHash });
    } catch (error) {
      logger.error('Failed to delete from cache', {
        emailHash,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clears all entries from cache
   *
   * @returns Promise resolving when cache is cleared
   *
   * @example
   * const cache = new AnalysisCache();
   * await cache.clear();
   * console.log('Cache cleared');
   */
  async clear(): Promise<void> {
    try {
      await executeTransaction('readwrite', (store) => store.clear());

      this.hitCount = 0;
      this.missCount = 0;

      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Failed to clear cache', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Removes expired entries from cache
   *
   * @returns Promise resolving to number of entries cleaned up
   *
   * @example
   * const cache = new AnalysisCache();
   * const cleaned = await cache.cleanupExpired();
   * console.log(`Cleaned ${cleaned} expired entries`);
   */
  async cleanupExpired(): Promise<number> {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      await executeTransaction('readwrite', (store) => {
        const index = store.index('timestamp');
        const range = IDBKeyRange.upperBound(now - CACHE_TTL);
        const request = index.openCursor(range);

        return new Promise<number>((resolve, reject) => {
          request.onsuccess = (event: Event): void => {
            const cursor = (event.target as IDBRequest).result;

            if (cursor) {
              cursor.delete();
              cleanedCount++;
              cursor.continue();
            } else {
              logger.info('Cache cleanup completed', { cleanedCount });
              resolve(cleanedCount);
            }
          };

          request.onerror = (): void => {
            const error = request.error;
            reject(new Error(`Cleanup failed: ${error?.message || 'Unknown error'}`));
          };
        });
      });

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired entries', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Gets cache statistics
   *
   * @returns Promise resolving to cache statistics
   *
   * @example
   * const cache = new AnalysisCache();
   * const stats = await cache.getStats();
   * console.log(`Hit rate: ${stats.hitRate}%`);
   */
  async getStats(): Promise<CacheStats> {
    try {
      const count = await executeTransaction<number>('readonly', (store) => store.count());
      const totalRequests = this.hitCount + this.missCount;
      const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;

      return {
        totalEntries: count,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to get cache stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        totalEntries: 0,
        hitRate: 0,
      };
    }
  }

  /**
   * Checks if cache contains a specific email hash
   *
   * @param emailHash - Hash of email to check
   * @returns Promise resolving to true if entry exists and is not expired
   */
  async has(emailHash: string): Promise<boolean> {
    try {
      const result = await this.get(emailHash);
      return result !== null;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves full cache entry including per-tag confidence scores
   *
   * @param emailHash - Hash of email content and headers
   * @returns Promise resolving to full cache entry or null if not found/expired
   *
   * @example
   * const cache = new AnalysisCache();
   * const entry = await cache.getWithDetails('a591a6d40...');
   * if (entry) {
   *   console.log('Tags:', entry.result.tags);
   *   console.log('Per-tag confidence:', entry.tagConfidence);
   *   console.log('Overall confidence:', entry.result.confidence);
   * }
   */
  async getWithDetails(emailHash: string): Promise<AnalysisCacheEntry | null> {
    try {
      const entry = await executeTransaction<AnalysisCacheEntry | null>('readonly', (store) =>
        store.get(emailHash)
      );

      if (!entry) {
        this.missCount++;
        logger.debug('Cache miss', { emailHash });
        return null;
      }

      // Check if entry has expired
      const now = Date.now();
      const age = now - entry.timestamp;
      const isExpired = age > CACHE_TTL;

      if (isExpired) {
        this.missCount++;
        logger.debug('Cache entry expired', { emailHash, age, ttl: CACHE_TTL });

        // Delete expired entry asynchronously
        await this.delete(emailHash);

        return null;
      }

      this.hitCount++;
      logger.info('Cache hit with details', { emailHash, age, hasTagConfidence: !!entry.tagConfidence });

      return entry;
    } catch (error) {
      logger.error('Failed to retrieve from cache', {
        emailHash,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Gets per-tag confidence scores for a cached email
   *
   * @param emailHash - Hash of email content and headers
   * @returns Promise resolving to map of tag to confidence score (0-1 range), or null if not found
   *
   * @example
   * const cache = new AnalysisCache();
   * const tagConfidence = await cache.getTagConfidence('a591a6d40...');
   * if (tagConfidence) {
   *   console.log('is_business confidence:', tagConfidence['is_business']);
   * }
   */
  async getTagConfidence(emailHash: string): Promise<Record<string, number> | null> {
    try {
      const entry = await this.getWithDetails(emailHash);
      return entry?.tagConfidence ?? null;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global cache instance for the application
 * Exported as singleton for consistent caching across the application
 */
export const analysisCache = new AnalysisCache();

// ============================================================================
// CACHE UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if an email should use cache based on age
 *
 * @param timestamp - Email timestamp in milliseconds
 * @param maxAge - Maximum age in milliseconds (default: 24 hours)
 * @returns True if email is fresh enough for caching
 */
export function isEmailFresh(timestamp: number, maxAge: number = CACHE_TTL): boolean {
  const age = Date.now() - timestamp;
  return age < maxAge;
}

/**
 * Calculates cache key from email headers
 * Extracts relevant headers for hashing
 *
 * @param headers - Full email headers object
 * @returns Normalized headers object for hashing
 */
export function normalizeHeaders(headers: EmailHeaders): EmailHeaders {
  const normalized: EmailHeaders = {};

  // Include only relevant headers for cache key
  const relevantHeaders = [
    'from',
    'to',
    'subject',
    'date',
    'message-id',
    'references',
    'in-reply-to',
  ];

  for (const key of relevantHeaders) {
    if (headers[key]) {
      normalized[key] = headers[key];
    }
  }

  return normalized;
}

/**
 * Combines body and headers into cache hash
 *
 * @param body - Email body content
 * @param headers - Email headers object
 * @returns Promise resolving to cache hash string
 */
export async function createCacheKey(body: string, headers: EmailHeaders): Promise<string> {
  const normalized = normalizeHeaders(headers);
  return hashEmail(body, normalized);
}
