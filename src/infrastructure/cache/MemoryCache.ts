/**
 * In-memory cache implementation using Map and Web Crypto API
 * @module infrastructure/cache/MemoryCache
 */

import { injectable } from 'tsyringe';
import type { ICache, ICacheEntry, ICacheStats } from '../interfaces/ICache';

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

/**
 * Default TTL in milliseconds (24 hours)
 */
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

// ============================================================================
// HASH FUNCTIONS
// ============================================================================

/**
 * Generates SHA-256 hash for cache key using Web Crypto API
 *
 * @param key - Original cache key string
 * @returns Promise resolving to hex string of SHA-256 hash
 *
 * @example
 * const hashedKey = await hashKey('user:123');
 * // Returns: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e'
 */
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// MEMORY CACHE IMPLEMENTATION
// ============================================================================

/**
 * In-memory cache implementation with TTL support and statistics
 * Uses Map for storage and Web Crypto API for key hashing
 *
 * @template T - Type of cached values
 *
 * @example
 * ```typescript
 * const cache = new MemoryCache();
 * await cache.set('user:123', userData, 3600000); // 1 hour TTL
 * const user = await cache.get<User>('user:123');
 * const stats = await cache.getStats();
 * ```
 */
@injectable()
export class MemoryCache implements ICache {
  /** Map for storing cache entries (hashed key -> entry) */
  private cache: Map<string, ICacheEntry<unknown>>;

  /** Cache hit counter for statistics */
  private hitCount: number;

  /** Cache miss counter for statistics */
  private missCount: number;

  /** Timestamp of last cleanup operation */
  private lastCleanup: number | undefined;

  /** ========================================================================
   * CONSTRUCTOR
   * ======================================================================== */

  /**
   * Creates new MemoryCache instance
   */
  constructor() {
    this.cache = new Map();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /** ========================================================================
   * CACHE OPERATIONS
   * ======================================================================== */

  /**
   * Retrieves a value from cache by key
   *
   * @template T - Type of value to retrieve
   * @param key - Cache key
   * @returns Promise resolving to cached value or null if not found/expired
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const hashedKey = await hashKey(key);
      const entry = this.cache.get(hashedKey);

      if (!entry) {
        this.missCount++;
        return null;
      }

      // Check if entry has expired
      const now = Date.now();
      const expirationTime = entry.timestamp + (entry.ttl || DEFAULT_TTL);
      const isExpired = now > expirationTime;

      if (isExpired) {
        this.missCount++;
        // Delete expired entry
        this.cache.delete(hashedKey);
        return null;
      }

      this.hitCount++;
      return entry.value as T;
    } catch {
      // Return null on any error (graceful degradation)
      this.missCount++;
      return null;
    }
  }

  /**
   * Stores a value in cache with optional TTL
   *
   * @template T - Type of value to store
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live in milliseconds (default: 86400000ms = 24h)
   * @returns Promise resolving when value is cached
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const hashedKey = await hashKey(key);
      const entry: ICacheEntry<T> = {
        key: hashedKey,
        value,
        timestamp: Date.now(),
        ttl: ttl || DEFAULT_TTL,
      };

      this.cache.set(hashedKey, entry);
    } catch {
      // Silently fail (graceful degradation)
    }
  }

  /**
   * Deletes a specific entry from cache
   *
   * @param key - Cache key to delete
   * @returns Promise resolving when entry is deleted
   */
  async delete(key: string): Promise<void> {
    try {
      const hashedKey = await hashKey(key);
      this.cache.delete(hashedKey);
    } catch {
      // Silently fail (graceful degradation)
    }
  }

  /**
   * Clears all entries from cache
   *
   * @returns Promise resolving when cache is cleared
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.lastCleanup = undefined;
  }

  /**
   * Checks if cache contains a non-expired entry
   *
   * @param key - Cache key to check
   * @returns Promise resolving to true if entry exists and is valid
   */
  async has(key: string): Promise<boolean> {
    try {
      const hashedKey = await hashKey(key);
      const entry = this.cache.get(hashedKey);

      if (!entry) {
        return false;
      }

      // Check if entry has expired
      const now = Date.now();
      const expirationTime = entry.timestamp + (entry.ttl || DEFAULT_TTL);
      return now <= expirationTime;
    } catch {
      return false;
    }
  }

  /**
   * Removes all expired entries from cache
   *
   * @returns Promise resolving to number of entries cleaned up
   */
  async cleanupExpired(): Promise<number> {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      const entries = Array.from(this.cache.entries());
      for (const [key, entry] of entries) {
        const expirationTime = entry.timestamp + (entry.ttl || DEFAULT_TTL);
        if (now > expirationTime) {
          this.cache.delete(key);
          cleanedCount++;
        }
      }

      this.lastCleanup = now;
      return cleanedCount;
    } catch {
      return 0;
    }
  }

  /**
   * Gets cache statistics for monitoring performance
   *
   * @returns Promise resolving to cache statistics
   */
  async getStats(): Promise<ICacheStats> {
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;

    return {
      totalEntries: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
      lastCleanup: this.lastCleanup,
    };
  }
}
