/**
 * Rate Limiter Service
 *
 * Provides rate limiting functionality for API requests to AI providers.
 * Uses token bucket algorithm with priority queue and per-model concurrency limiting.
 *
 * This service:
 * - Manages token buckets per provider with refill rate
 * - Enforces concurrency limits per model using semaphores
 * - Supports priority-based queuing of requests
 * - Provides statistics and reset capabilities
 *
 * @module application/services/RateLimiterService
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Rate limiter bucket state.
 */
export interface RateLimiterBucket {
  /** Current number of tokens available */
  tokens: number;
  /** Timestamp of last token refill */
  lastRefill: number;
  /** Maximum number of tokens (bucket size) */
  limit: number;
  /** Time window for token refill in milliseconds */
  window: number;
}

/**
 * Rate limiter configuration for a provider.
 */
export interface RateLimiterConfig {
  /** Maximum number of tokens per time window */
  limit: number;
  /** Time window in milliseconds */
  window: number;
}

/**
 * Rate limiter configuration map for all providers.
 */
export type RateLimiterConfigMap = Record<string, RateLimiterConfig>;

/**
 * Queued task for rate limiter.
 */
export interface QueuedTask<T = unknown> {
  /** Async function to execute */
  fn: () => Promise<T>;
  /** Resolve function for the task promise */
  resolve: (value: unknown) => void;
  /** Reject function for the task promise */
  reject: (reason: unknown) => void;
  /** Priority level (higher = more important) */
  priority: number;
}

/**
 * Rate limiter state buckets map.
 */
export type RateLimiterBuckets = Record<string, RateLimiterBucket>;

/**
 * Rate limiter queues map.
 */
export type RateLimiterQueues = Record<string, QueuedTask<unknown>[]>;

/**
 * Rate limiter processing promises map.
 */
export type RateLimiterProcessing = Record<string, Promise<void> | null>;

/**
 * Model concurrency configuration.
 */
export type ModelConcurrencyConfig = Record<string, number>;

/**
 * Semaphore state for a model.
 */
export interface ModelSemaphore {
  /** Number of currently active requests */
  active: number;
  /** Maximum concurrent requests allowed */
  limit: number;
  /** Array of waiting promises */
  waiting: Array<{ resolve: () => void; reject: (reason: unknown) => void }>;
}

/**
 * Priority type for rate limiter tasks.
 */
export type Priority = number;

/**
 * Statistics for rate limiter.
 */
export interface RateLimiterStats {
  /** Provider statistics */
  providers: Record<
    string,
    {
      /** Current number of tokens available */
      tokens: number;
      /** Maximum token limit */
      limit: number;
      /** Number of queued tasks */
      queueLength: number;
      /** Whether currently processing */
      isProcessing: boolean;
      /** Number of active concurrent requests */
      activeConcurrency?: number;
      /** Maximum concurrent requests allowed */
      maxConcurrency?: number;
    }
  >;
  /** Total number of queued tasks across all providers */
  totalQueued: number;
}

/**
 * Result of clearing the queue.
 */
export interface ClearQueueResult {
  /** Number of cleared tasks */
  clearedTasks: number;
  /** List of providers with cancelled processing */
  cancelledProviders: string[];
  /** Status of each provider */
  providers: Record<string, { queueLength: number; isProcessing: boolean }>;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Rate Limiter Service
 *
 * Manages API request rates using token bucket algorithm.
 * Supports per-provider rate limits and per-model concurrency limits.
 *
 * @example
 * ```typescript
 * const service = container.resolve<RateLimiterService>(RateLimiterService);
 *
 * // Configure providers
 * service.configure({
 *   openai: { limit: 500, window: 60000 },
 *   claude: { limit: 50, window: 60000 }
 * });
 *
 * // Execute with rate limiting
 * await service.acquire('openai', async () => {
 *   return await callOpenAI();
 * }, 1, 'gpt-4');
 * ```
 */
@injectable()
export class RateLimiterService {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly buckets: RateLimiterBuckets;
  private readonly queues: RateLimiterQueues;
  private readonly processing: RateLimiterProcessing;
  private readonly modelSemaphores: Record<string, ModelSemaphore>;
  private modelConcurrencyConfig: ModelConcurrencyConfig;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  /**
   * Creates a new RateLimiterService instance.
   *
   * @param logger - Logger instance for logging operations
   */
  constructor(@inject('ILogger') private readonly logger: ILogger) {
    this.buckets = {};
    this.queues = {};
    this.processing = {};
    this.modelSemaphores = {};
    this.modelConcurrencyConfig = {};

    this.logger.debug('RateLimiterService initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Configures rate limits for providers.
   *
   * @param config - Rate limiter configuration for each provider
   * @param modelConcurrency - Optional per-model concurrency limits
   */
  configure(
    config: RateLimiterConfigMap,
    modelConcurrency: ModelConcurrencyConfig = {}
  ): void {
    this.logger.info('Configuring rate limiter', {
      providers: Object.keys(config),
      modelConcurrency,
    });

    // Clear existing configuration
    this.reset();

    // Initialize buckets and queues for each provider
    for (const provider in config) {
      this.buckets[provider] = {
        tokens: config[provider].limit,
        lastRefill: Date.now(),
        limit: config[provider].limit,
        window: config[provider].window,
      };
      this.queues[provider] = [];
      this.processing[provider] = null;
    }

    // Store model concurrency configuration
    this.modelConcurrencyConfig = modelConcurrency;

    this.logger.info('Rate limiter configured', {
      providers: Object.keys(this.buckets).join(', '),
    });
  }

  /**
   * Acquires a token and executes a function with rate limiting.
   *
   * Waits if no tokens are available. Supports priority queuing and
   * optional per-model concurrency limiting.
   *
   * @param provider - Provider name
   * @param requestFn - Async function to execute
   * @param priority - Priority level (higher = more important, default: 1)
   * @param model - Optional model name for concurrency limiting
   * @returns Promise resolving to function result
   *
   * @throws {Error} If provider is not configured
   *
   * @example
   * ```typescript
   * const result = await rateLimiter.acquire('openai', async () => {
   *   return await callOpenAI();
   * }, 1, 'gpt-4');
   * ```
   */
  async acquire<T>(
    provider: string,
    requestFn: () => Promise<T>,
    priority: number = 1,
    model?: string
  ): Promise<T> {
    // Defensive check: Provider must be configured
    if (!(provider in this.queues)) {
      throw new Error(
        `Provider '${provider}' not configured in RateLimiter. Valid providers: ${Object.keys(
          this.queues
        ).join(', ')}`
      );
    }

    this.logger.debug('Acquiring token', { provider, priority, model });

    // Wrap the request function with semaphore logic if model is specified
    const wrappedFn = async (): Promise<T> => {
      if (!model) {
        return await requestFn();
      }

      await this.acquireSemaphore(provider, model);
      try {
        return await requestFn();
      } finally {
        this.releaseSemaphore(provider, model);
      }
    };

    return new Promise<T>((resolve, reject) => {
      this.queues[provider].push({
        fn: wrappedFn,
        resolve: resolve as (value: unknown) => void,
        reject,
        priority,
      });
      this.queues[provider].sort((a, b) => b.priority - a.priority);
      this.processQueue(provider);
    });
  }

  /**
   * Attempts to acquire a token without waiting.
   *
   * Returns true and executes the function immediately if a token is available.
   * Returns false if no token is available.
   *
   * @param provider - Provider name
   * @param requestFn - Async function to execute if token is available
   * @returns Promise resolving to true if executed, false otherwise
   *
   * @example
   * ```typescript
   * if (await rateLimiter.tryAcquire('openai', async () => {
   *   return await callOpenAI();
   * })) {
   *   console.log('Request executed immediately');
   * } else {
   *   console.log('No token available');
   * }
   * ```
   */
  async tryAcquire<T>(provider: string, requestFn: () => Promise<T>): Promise<boolean> {
    if (!(provider in this.queues)) {
      return false;
    }

    this.refillTokens(provider);

    if (this.buckets[provider].tokens >= 1) {
      this.consumeToken(provider);
      try {
        await requestFn();
        return true;
      } catch (error) {
        this.logger.error('Error in tryAcquire execution', { provider, error });
        return false;
      }
    }

    return false;
  }

  /**
   * Gets current statistics for all providers.
   *
   * @returns Current rate limiter statistics
   */
  getStats(): RateLimiterStats {
    const stats: RateLimiterStats = {
      providers: {},
      totalQueued: 0,
    };

    for (const provider in this.buckets) {
      const bucket = this.buckets[provider];
      const semaphore = this.getFirstSemaphoreForProvider(provider);
      const queueLength = this.queues[provider].length;

      stats.providers[provider] = {
        tokens: bucket.tokens,
        limit: bucket.limit,
        queueLength,
        isProcessing: this.processing[provider] !== null,
      };

      if (semaphore) {
        stats.providers[provider].activeConcurrency = semaphore.active;
        stats.providers[provider].maxConcurrency = semaphore.limit;
      }

      stats.totalQueued += queueLength;
    }

    return stats;
  }

  /**
   * Resets the rate limiter to initial state.
   *
   * Clears all buckets, queues, and semaphores.
   */
  reset(): void {
    this.logger.info('Resetting rate limiter');

    // Clear all state
    for (const provider in this.buckets) {
      delete this.buckets[provider];
    }
    for (const provider in this.queues) {
      delete this.queues[provider];
    }
    for (const provider in this.processing) {
      delete this.processing[provider];
    }
    for (const semaphoreKey in this.modelSemaphores) {
      delete this.modelSemaphores[semaphoreKey];
    }

    this.logger.info('Rate limiter reset complete');
  }

  /**
   * Clears all queues and optionally cancels running processes.
   *
   * @param cancelRunning - Whether to reject pending tasks and clear processing promises
   * @returns Statistics about cleared queues
   */
  clearQueue(cancelRunning: boolean = false): ClearQueueResult {
    let clearedTasks = 0;
    const cancelledProviders: string[] = [];
    const providers: Record<string, { queueLength: number; isProcessing: boolean }> = {};

    for (const provider in this.queues) {
      const queueLength = this.queues[provider].length;
      const isCurrentlyExecuting = this.processing[provider] !== null;

      clearedTasks += queueLength;

      // Reject all pending tasks in the queue (only if not currently executing)
      if (cancelRunning && queueLength > 0) {
        if (!isCurrentlyExecuting) {
          for (const task of this.queues[provider]) {
            task.reject(new Error('Queue cleared'));
          }
        }
      }

      // Clear the queue (only if not currently executing)
      if (!isCurrentlyExecuting) {
        this.queues[provider] = [];
      }

      // Clear processing flag if requested and provider is processing
      if (cancelRunning && isCurrentlyExecuting) {
        this.processing[provider] = null;
        cancelledProviders.push(provider);
      }

      providers[provider] = {
        queueLength: queueLength,
        isProcessing: isCurrentlyExecuting,
      };
    }

    this.logger.info('Rate limiter queues cleared', {
      clearedTasks,
      cancelledProviders,
      providers,
    });

    return {
      clearedTasks,
      cancelledProviders,
      providers,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Gets or creates a semaphore for a model.
   *
   * @param provider - Provider name
   * @param model - Model name
   * @returns Semaphore for the model
   */
  private getSemaphore(provider: string, model: string): ModelSemaphore {
    const semaphoreKey = `${provider}:${model}`;

    if (!this.modelSemaphores[semaphoreKey]) {
      const limit = this.getConcurrencyLimit(provider, model);
      this.modelSemaphores[semaphoreKey] = {
        active: 0,
        limit,
        waiting: [],
      };
    }
    return this.modelSemaphores[semaphoreKey];
  }

  /**
   * Gets the first semaphore for a provider (for statistics).
   *
   * @param provider - Provider name
   * @returns First semaphore or undefined
   */
  private getFirstSemaphoreForProvider(provider: string): ModelSemaphore | undefined {
    const prefix = `${provider}:`;
    const key = Object.keys(this.modelSemaphores).find((k) => k.startsWith(prefix));
    return key ? this.modelSemaphores[key] : undefined;
  }

  /**
   * Gets concurrency limit for a model.
   *
   * @param provider - Provider name
   * @param model - Model name
   * @returns Concurrency limit
   */
  private getConcurrencyLimit(provider: string, model: string): number {
    const key = `${provider}:${model}`;
    return this.modelConcurrencyConfig[key] || 1; // Default: 1 concurrent request
  }

  /**
   * Acquires a semaphore slot for a model.
   *
   * Waits if all slots are occupied.
   *
   * @param provider - Provider name
   * @param model - Model name
   * @returns Promise that resolves when a slot is acquired
   */
  private async acquireSemaphore(provider: string, model: string): Promise<void> {
    const semaphore = this.getSemaphore(provider, model);

    if (semaphore.active < semaphore.limit) {
      semaphore.active++;
      return;
    }

    return new Promise<void>((resolve, reject) => {
      semaphore.waiting.push({ resolve, reject });
    });
  }

  /**
   * Releases a semaphore slot for a model.
   *
   * @param provider - Provider name
   * @param model - Model name
   */
  private releaseSemaphore(provider: string, model: string): void {
    const semaphore = this.getSemaphore(provider, model);
    semaphore.active--;

    if (semaphore.waiting.length > 0) {
      const next = semaphore.waiting.shift();
      if (next) {
        semaphore.active++;
        next.resolve();
      }
    }
  }

  /**
   * Refills tokens based on elapsed time since last refill.
   *
   * @param provider - Provider to refill tokens for
   */
  private refillTokens(provider: string): void {
    const bucket = this.buckets[provider];
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refillAmount = (elapsed / bucket.window) * bucket.limit;

    bucket.tokens = Math.min(bucket.limit, bucket.tokens + refillAmount);
    bucket.lastRefill = now;
  }

  /**
   * Checks if provider has available tokens.
   *
   * @param provider - Provider to check
   * @returns True if at least 1 token is available
   */
  private hasTokens(provider: string): boolean {
    this.refillTokens(provider);
    return this.buckets[provider].tokens >= 1;
  }

  /**
   * Consumes one token from the provider's bucket.
   *
   * @param provider - Provider to consume token from
   */
  private consumeToken(provider: string): void {
    this.buckets[provider].tokens -= 1;
  }

  /**
   * Processes the queue for a given provider.
   *
   * @param provider - Provider to process queue for
   */
  private async processQueue(provider: string): Promise<void> {
    if (this.processing[provider]) {
      await this.processing[provider];
      return;
    }

    this.processing[provider] = (async (): Promise<void> => {
      try {
        while (this.queues[provider].length > 0) {
          const { fn, resolve, reject } = this.queues[provider].shift()!;

          // Wait for token to become available
          while (!this.hasTokens(provider)) {
            await new Promise<void>((r) => setTimeout(r, 100));
          }

          this.consumeToken(provider);

          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }
      } finally {
        this.processing[provider] = null;
      }
    })();

    await this.processing[provider];
  }
}
