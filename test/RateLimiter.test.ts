import {
  RateLimiterConfigMap,
  RateLimiterBuckets,
  RateLimiterQueues,
  RateLimiterProcessing,
  QueuedTask,
  ModelSemaphore,
  ModelConcurrencyConfig,
  Priority,
} from '../background';

export { RateLimiterConfigMap, RateLimiterBuckets, RateLimiterQueues, RateLimiterProcessing, QueuedTask, ModelSemaphore, ModelConcurrencyConfig, Priority };

export interface RateLimiterConstructorParams {
  config: RateLimiterConfigMap;
  getConcurrencyLimit: (provider: string, model: string) => number;
}

/**
 * Rate limiter class to manage API request rates per provider
 * Uses token bucket algorithm with priority queue
 * Extended with per-model concurrency limiting using semaphores
 */
export class TestableRateLimiter {
  public readonly buckets: RateLimiterBuckets;
  private readonly queues: RateLimiterQueues;
  private readonly processing: RateLimiterProcessing;
  private readonly modelSemaphores: Record<string, ModelSemaphore>;
  private readonly getConcurrencyLimit: (provider: string, model: string) => number;

  /**
   * Creates a new RateLimiter instance
   * @param params - Configuration parameters
   */
  constructor(params: RateLimiterConstructorParams) {
    const { config, getConcurrencyLimit } = params;
    this.buckets = {};
    this.queues = {};
    this.processing = {};
    this.modelSemaphores = {};
    this.getConcurrencyLimit = getConcurrencyLimit;

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
  }

  /**
   * Gets or creates a semaphore for a model
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
   * Acquires a semaphore slot for a model
   * Waits if all slots are occupied
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
   * Releases a semaphore slot for a model
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
   * Refills tokens based on elapsed time since last refill
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
   * Checks if provider has available tokens
   * @param provider - Provider to check
   * @returns True if at least 1 token is available
   */
  private hasTokens(provider: string): boolean {
    this.refillTokens(provider);
    return this.buckets[provider].tokens >= 1;
  }

  /**
   * Consumes one token from the provider's bucket
   * @param provider - Provider to consume token from
   */
  private consumeToken(provider: string): void {
    this.buckets[provider].tokens -= 1;
  }

  /**
   * Processes the queue for a given provider
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

          while (!this.hasTokens(provider)) {
            await new Promise<void>((r) => setTimeout(r, 10));
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

  /**
   * Executes a function with rate limiting and priority queuing
   * @param provider - Provider to execute function for
   * @param requestFn - Async function to execute
   * @param priority - Priority level (higher = more important)
   * @param model - Optional model name for concurrency limiting
   * @returns Promise resolving to function result
   */
  async execute<T>(
    provider: string,
    requestFn: () => Promise<T>,
    priority: Priority = 1,
    model?: string
  ): Promise<T> {
    if (!(provider in this.queues)) {
      throw new Error(
        `Provider '${provider}' not configured in RateLimiter. Valid providers: ${Object.keys(this.queues).join(', ')}`
      );
    }

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
   * Clears all queues and optionally cancels running processes
   * @param cancelRunning - Whether to reject pending tasks and clear processing promises
   * @returns Statistics about cleared queues
   */
  clearQueue(cancelRunning: boolean = false): {
    clearedTasks: number;
    cancelledProviders: string[];
    providers: Record<string, { queueLength: number; isProcessing: boolean }>;
  } {
    let clearedTasks = 0;
    const cancelledProviders: string[] = [];
    const providers: Record<string, { queueLength: number; isProcessing: boolean }> = {};

    for (const provider in this.queues) {
      const queueLength = this.queues[provider].length;
      const isCurrentlyExecuting = this.processing[provider] !== null;

      clearedTasks += queueLength;

      if (cancelRunning && queueLength > 0) {
        if (!isCurrentlyExecuting) {
          for (const task of this.queues[provider]) {
            task.reject(new Error('Queue cleared'));
          }
        }
      }

      if (!isCurrentlyExecuting) {
        this.queues[provider] = [];
      }

      if (cancelRunning && isCurrentlyExecuting) {
        this.processing[provider] = null;
        cancelledProviders.push(provider);
      }

      providers[provider] = {
        queueLength: queueLength,
        isProcessing: isCurrentlyExecuting,
      };
    }

    return {
      clearedTasks,
      cancelledProviders,
      providers,
    };
  }
}
