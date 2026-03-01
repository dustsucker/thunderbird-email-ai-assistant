/**
 * CacheAnalysisUseCase
 *
 * Handles caching operations for email analysis results.
 * Provides methods to generate cache keys, get, and set cached results.
 *
 * @module application/use-cases/CacheAnalysisUseCase
 */

import { injectable, inject } from 'tsyringe';
import type { ICache } from '@/infrastructure/interfaces/ICache';
import type { IProviderSettings, ITagResponse } from '@/infrastructure/interfaces/IProvider';
import type { IEmailMessage } from '@/infrastructure/interfaces/IMailReader';
import type { ILogger } from '@/domain/interfaces';

// ============================================================================
// Browser-compatible Crypto Utilities
// ============================================================================

/**
 * SHA-256 hash function using Web Crypto API (browser-compatible).
 *
 * @param message - String to hash
 * @returns Promise resolving to hex-encoded SHA-256 hash
 * @throws {Error} If Web Crypto API is not available
 */
async function sha256(message: string): Promise<string> {
  // Get crypto.subtle from global window or self (for Web Workers)
  const subtleCrypto =
    (typeof window !== 'undefined' && window.crypto?.subtle) ||
    (typeof self !== 'undefined' && self.crypto?.subtle);

  if (!subtleCrypto) {
    throw new Error('Web Crypto API (crypto.subtle) is not available in this environment');
  }

  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await subtleCrypto.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Result of cache key generation.
 */
export interface CacheKeyResult {
  /** SHA-256 hash cache key */
  cacheKey: string;
}

// ============================================================================
// Use Case Implementation
// ============================================================================

/**
 * CacheAnalysisUseCase
 *
 * Provides caching operations for email analysis results.
 * Uses SHA-256 hashing to generate deterministic cache keys.
 *
 * @example
 * ```typescript
 * const useCase = container.resolve<CacheAnalysisUseCase>(CacheAnalysisUseCase);
 *
 * // Generate key
 * const { cacheKey } = await useCase.generateKey(email, providerSettings);
 *
 * // Check cache
 * const cached = await useCase.get(cacheKey);
 *
 * // Store result
 * await useCase.set(cacheKey, result, 24 * 60 * 60 * 1000);
 * ```
 */
@injectable()
export class CacheAnalysisUseCase {
  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject('ICache') private readonly cache: ICache,
    @inject('ILogger') private readonly logger: ILogger
  ) {
    this.logger.debug('✅ CacheAnalysisUseCase initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Generates a cache key from email content and provider settings.
   *
   * Uses SHA-256 hash of email headers + body + provider ID + model.
   *
   * @param email - Email message
   * @param providerSettings - Provider settings
   * @returns Promise resolving to cache key result
   *
   * @example
   * ```typescript
   * const { cacheKey } = await useCase.generateKey(email, providerSettings);
   * ```
   */
  async generateKey(
    email: IEmailMessage,
    providerSettings: IProviderSettings
  ): Promise<CacheKeyResult> {
    const keyData = JSON.stringify({
      subject: email.subject,
      from: email.from,
      to: email.to,
      body: email.body,
      providerId: providerSettings.provider,
      model: providerSettings.model,
    });

    const cacheKey = await sha256(keyData);
    this.logger.debug('🔐 Generated cache key', { hash: cacheKey.substring(0, 16) + '...' });

    return { cacheKey };
  }

  /**
   * Retrieves cached analysis result.
   *
   * @param cacheKey - Cache key to look up
   * @returns Cached result or null if not found/expired
   *
   * @example
   * ```typescript
   * const cached = await useCase.get(cacheKey);
   * if (cached) {
   *   console.log('Cache hit!');
   * }
   * ```
   */
  async get(cacheKey: string): Promise<ITagResponse | null> {
    this.logger.debug('💾 Checking cache', { cacheKey: cacheKey.substring(0, 16) + '...' });

    try {
      const cached = await this.cache.get<ITagResponse>(cacheKey);
      if (cached) {
        this.logger.debug('✅ Cache HIT', { cacheKey: cacheKey.substring(0, 16) + '...' });
        return cached;
      }

      this.logger.debug('⚠️  Cache MISS', { cacheKey: cacheKey.substring(0, 16) + '...' });
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️  Failed to check cache', {
        cacheKey: cacheKey.substring(0, 16) + '...',
        error: errorMessage,
      });
      return null;
    }
  }

  /**
   * Stores analysis result in cache.
   *
   * @param cacheKey - Cache key
   * @param result - Analysis result to cache
   * @param ttl - Time-to-live in milliseconds
   *
   * @example
   * ```typescript
   * await useCase.set(cacheKey, result, 24 * 60 * 60 * 1000); // 24 hours
   * ```
   */
  async set(cacheKey: string, result: ITagResponse, ttl: number): Promise<void> {
    this.logger.debug('💾 Caching analysis result', {
      cacheKey: cacheKey.substring(0, 16) + '...',
      ttl: `${ttl / 1000 / 60}min`,
    });

    try {
      await this.cache.set(cacheKey, result, ttl);
      this.logger.debug('✅ Analysis result cached', {
        cacheKey: cacheKey.substring(0, 16) + '...',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️  Failed to cache result', {
        cacheKey: cacheKey.substring(0, 16) + '...',
        error: errorMessage,
      });
      // Non-fatal error, continue execution
    }
  }
}
