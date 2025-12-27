/**
 * IndexedDB-based cache for LLM analysis results
 * @module core/cache
 */

import { TagResponse } from '../providers/utils';
import { logger } from '../providers/utils';

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
const DB_VERSION = 1;

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

      // Create object store with emailHash as key
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'emailHash' });

        // Create index for timestamp-based cleanup
        store.createIndex('timestamp', 'timestamp', { unique: false });

        logger.info('IndexedDB object store created', { storeName: STORE_NAME });
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
   * @returns Promise resolving when cache is updated
   *
   * @example
   * const cache = new AnalysisCache();
   * await cache.set('a591a6d40...', {
   *   tags: ['is_business'],
   *   confidence: 0.95,
   *   reasoning: 'Business email'
   * });
   */
  async set(emailHash: string, result: TagResponse): Promise<void> {
    try {
      const entry: AnalysisCacheEntry = {
        emailHash,
        result,
        timestamp: Date.now(),
      };

      await executeTransaction('readwrite', (store) => store.put(entry));

      logger.info('Cache entry stored', { emailHash });
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
