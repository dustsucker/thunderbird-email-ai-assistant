/**
 * Cache interface for storing and retrieving typed data with TTL support
 * @module infrastructure/interfaces/ICache
 */

/**
 * Generic cache entry with metadata
 * @template T - Type of cached value
 */
export interface ICacheEntry<T> {
  /** Unique cache key (SHA-256 hash) */
  key: string;
  /** Cached value */
  value: T;
  /** Creation timestamp in milliseconds */
  timestamp: number;
  /** Time-to-live in milliseconds (optional, default 24h) */
  ttl?: number;
}

/**
 * Cache statistics for monitoring cache performance
 */
export interface ICacheStats {
  /** Total number of entries in cache */
  totalEntries: number;
  /** Cache hit rate as percentage (0-100) */
  hitRate: number;
  /** Timestamp of last cleanup operation */
  lastCleanup?: number;
}

/**
 * Generic cache interface for typed caching with TTL and statistics
 * @template T - Type of cached values
 *
 * @example
 * ```typescript
 * const cache = container.resolve(ICache);
 * await cache.set('user:123', userData, 3600000); // 1 hour TTL
 * const data = await cache.get<User>('user:123');
 * const stats = await cache.getStats();
 * console.log(`Hit rate: ${stats.hitRate}%`);
 * ```
 */
export interface ICache {
  /**
   * Retrieves a value from cache by key
   *
   * @template T - Type of value to retrieve
   * @param key - Cache key
   * @returns Promise resolving to cached value or null if not found/expired
   *
   * @example
   * const user = await cache.get<User>('user:123');
   * if (user) {
   *   console.log('Found user:', user.name);
   * }
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Stores a value in cache with optional TTL
   *
   * @template T - Type of value to store
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live in milliseconds (default: 86400000ms = 24h)
   * @returns Promise resolving when value is cached
   *
   * @example
   * await cache.set('analysis:abc123', result, 3600000); // 1 hour TTL
   * await cache.set('config:theme', 'dark'); // Default 24h TTL
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Deletes a specific entry from cache
   *
   * @param key - Cache key to delete
   * @returns Promise resolving when entry is deleted
   *
   * @example
   * await cache.delete('user:123');
   */
  delete(key: string): Promise<void>;

  /**
   * Clears all entries from cache
   *
   * @returns Promise resolving when cache is cleared
   *
   * @example
   * await cache.clear();
   */
  clear(): Promise<void>;

  /**
   * Checks if cache contains a non-expired entry
   *
   * @param key - Cache key to check
   * @returns Promise resolving to true if entry exists and is valid
   *
   * @example
   * if (await cache.has('user:123')) {
   *   console.log('User is cached');
   * }
   */
  has(key: string): Promise<boolean>;

  /**
   * Removes all expired entries from cache
   *
   * @returns Promise resolving to number of entries cleaned up
   *
   * @example
   * const cleaned = await cache.cleanupExpired();
   * console.log(`Cleaned ${cleaned} expired entries`);
   */
  cleanupExpired(): Promise<number>;

  /**
   * Gets cache statistics for monitoring performance
   *
   * @returns Promise resolving to cache statistics
   *
   * @example
   * const stats = await cache.getStats();
   * console.log(`Hit rate: ${stats.hitRate}%, Entries: ${stats.totalEntries}`);
   */
  getStats(): Promise<ICacheStats>;
}
