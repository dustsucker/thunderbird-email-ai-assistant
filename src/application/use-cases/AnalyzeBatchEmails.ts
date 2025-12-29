/**
 * AnalyzeBatchEmails Use Case
 *
 * Orchestrates batch analysis of multiple email messages.
 * Uses priority queue for managing concurrent analysis tasks.
 *
 * This use case provides:
 * 1. Queue-based batch processing with priority support
 * 2. Progress tracking for batch operations
 * 3. Cancellation support for long-running batches
 * 4. Concurrent analysis with configurable concurrency limits
 *
 * @module application/use-cases/AnalyzeBatchEmails
 */

import { injectable, inject } from 'tsyringe';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import { AnalyzeEmail } from './AnalyzeEmail';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Progress tracking information for batch analysis.
 */
export interface BatchProgress {
  /** Total number of emails to analyze */
  total: number;
  /** Number of emails successfully processed */
  processed: number;
  /** Number of emails that failed */
  failed: number;
  /** Percentage of completion (0-100) */
  percentage: number;
  /** Whether the batch is currently running */
  isRunning: boolean;
  /** Whether the batch was cancelled */
  isCancelled: boolean;
  /** Message IDs that have been processed */
  processedMessageIds: string[];
  /** Message IDs that failed to process */
  failedMessageIds: string[];
}

/**
 * Configuration for batch analysis.
 */
export interface BatchAnalysisConfig {
  /** Provider settings for analysis */
  providerSettings: IProviderSettings;
  /** Priority level for queue items (higher = more important, default: 1) */
  priority?: number;
  /** Maximum concurrent analyses (default: 3) */
  concurrency?: number;
  /** Delay between analyses in milliseconds (default: 0) */
  delayBetweenAnalyses?: number;
  /** Whether to continue on error (default: true) */
  continueOnError?: boolean;
}

/**
 * Result of a single email analysis in a batch.
 */
export interface EmailAnalysisResult {
  /** Message ID that was analyzed */
  messageId: string;
  /** Whether analysis was successful */
  success: boolean;
  /** Tags that were assigned (if successful) */
  tags?: string[];
  /** Error message (if failed) */
  error?: string;
}

/**
 * Overall batch analysis result.
 */
export interface BatchAnalysisResult {
  /** Total number of emails in the batch */
  total: number;
  /** Number of successfully analyzed emails */
  successCount: number;
  /** Number of failed analyses */
  failureCount: number;
  /** Individual results for each email */
  results: EmailAnalysisResult[];
  /** Whether the batch was cancelled */
  cancelled: boolean;
}

/**
 * Item stored in the queue for batch processing.
 */
interface QueueItem {
  /** Message ID to analyze */
  messageId: string;
  /** Provider settings for this analysis */
  providerSettings: IProviderSettings;
}

/**
 * Default batch configuration values.
 */
const DEFAULT_BATCH_CONFIG = {
  DEFAULT_CONCURRENCY: 3,
  DEFAULT_PRIORITY: 1,
  DEFAULT_DELAY_BETWEEN_ANALYSES: 0,
  DEFAULT_CONTINUE_ON_ERROR: true,
} as const;

// ============================================================================
// Use Case Implementation
// ============================================================================

/**
 * AnalyzeBatchEmails Use Case
 *
 * Manages batch email analysis with queue-based processing.
 * Provides progress tracking and cancellation support.
 *
 * @example
 * ```typescript
 * const useCase = container.resolve<AnalyzeBatchEmails>(AnalyzeBatchEmails);
 *
 * // Start batch analysis
 * await useCase.execute(['12345', '12346', '12347'], {
 *   providerSettings: { provider: 'openai', apiKey: 'sk-...' },
 *   priority: 1,
 *   concurrency: 3
 * });
 *
 * // Monitor progress
 * const progress = await useCase.getProgress();
 * console.log(`Progress: ${progress.percentage}%`);
 *
 * // Cancel if needed
 * await useCase.cancel();
 * ```
 */
@injectable()
export class AnalyzeBatchEmails {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly analyzeEmail: AnalyzeEmail;
  private readonly queue: IQueue;
  private readonly logger: ILogger;
  private readonly configRepository: IConfigRepository;

  // Batch state
  private isProcessing = false;
  private isCancelled = false;
  private processedCount = 0;
  private failedCount = 0;
  private totalCount = 0;
  private processedMessageIds: string[] = [];
  private failedMessageIds: string[] = [];
  private analysisResults: EmailAnalysisResult[] = [];
  private resolvePromise: ((value: BatchAnalysisResult) => void) | null = null;
  private activeWorkers: Promise<void>[] = [];

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject(AnalyzeEmail) analyzeEmail: AnalyzeEmail,
    @inject('IQueue') queue: IQueue,
    @inject('ILogger') logger: ILogger,
    @inject('IConfigRepository') configRepository: IConfigRepository
  ) {
    this.analyzeEmail = analyzeEmail;
    this.queue = queue;
    this.logger = logger;
    this.configRepository = configRepository;
    this.logger.debug('AnalyzeBatchEmails use case initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Executes batch email analysis.
   *
   * @param messageIds - Array of message IDs to analyze
   * @param config - Batch analysis configuration
   * @returns Promise resolving to batch analysis result
   *
   * @throws {Error} If a batch is already running
   *
   * @example
   * ```typescript
   * const result = await analyzeBatchEmails.execute(
   *   ['12345', '12346', '12347'],
   *   { providerSettings: { provider: 'openai', apiKey: 'sk-...' } }
   * );
   * console.log(`Success: ${result.successCount}, Failed: ${result.failureCount}`);
   * ```
   */
  async execute(messageIds: string[], config: BatchAnalysisConfig): Promise<BatchAnalysisResult> {
    // Load batch settings from AppConfig with fallback to defaults
    const appConfig = await this.loadAppConfig();
    const concurrency =
      config.concurrency ?? this.getConcurrencyLimit(appConfig, config.providerSettings);
    const priority = config.priority ?? DEFAULT_BATCH_CONFIG.DEFAULT_PRIORITY;
    const delayBetweenAnalyses =
      config.delayBetweenAnalyses ?? DEFAULT_BATCH_CONFIG.DEFAULT_DELAY_BETWEEN_ANALYSES;
    const continueOnError =
      config.continueOnError ?? DEFAULT_BATCH_CONFIG.DEFAULT_CONTINUE_ON_ERROR;

    if (this.isProcessing) {
      throw new Error('Batch analysis is already running. Wait for current batch to complete.');
    }

    this.logger.info('Starting batch email analysis', {
      count: messageIds.length,
      priority,
      concurrency,
    });

    try {
      // Initialize batch state
      this.isProcessing = true;
      this.isCancelled = false;
      this.processedCount = 0;
      this.failedCount = 0;
      this.totalCount = messageIds.length;
      this.processedMessageIds = [];
      this.failedMessageIds = [];
      this.analysisResults = [];

      new Promise<BatchAnalysisResult>((resolve) => {
        this.resolvePromise = resolve;
      });

      // Enqueue all messages
      for (const messageId of messageIds) {
        const queueItem: QueueItem = {
          messageId,
          providerSettings: config.providerSettings,
        };
        await this.queue.enqueue(queueItem, priority);
      }

      this.logger.debug('All messages enqueued', { count: messageIds.length });

      // Start worker processes
      for (let i = 0; i < concurrency; i++) {
        this.activeWorkers.push(this.startWorker(delayBetweenAnalyses, continueOnError));
      }

      // Wait for all workers to complete
      await Promise.all(this.activeWorkers);

      // Resolve the batch promise
      const result: BatchAnalysisResult = {
        total: this.totalCount,
        successCount: this.processedCount,
        failureCount: this.failedCount,
        results: this.analysisResults,
        cancelled: this.isCancelled,
      };

      if (this.resolvePromise) {
        this.resolvePromise(result);
      }

      this.logger.info('Batch analysis completed', {
        total: result.total,
        success: result.successCount,
        failed: result.failureCount,
        cancelled: result.cancelled,
      });

      this.resetState();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Batch analysis failed', { error: errorMessage });

      // Reset state on error
      this.resetState();

      throw new Error(`Batch analysis failed: ${errorMessage}`);
    }
  }

  /**
   * Gets current progress of the batch analysis.
   *
   * @returns Promise resolving to progress information
   *
   * @example
   * ```typescript
   * const progress = await analyzeBatchEmails.getProgress();
   * console.log(`Progress: ${progress.percentage}%`);
   * ```
   */
  async getProgress(): Promise<BatchProgress> {
    const percentage =
      this.totalCount > 0
        ? Math.round(((this.processedCount + this.failedCount) / this.totalCount) * 100)
        : 0;

    return {
      total: this.totalCount,
      processed: this.processedCount,
      failed: this.failedCount,
      percentage,
      isRunning: this.isProcessing,
      isCancelled: this.isCancelled,
      processedMessageIds: [...this.processedMessageIds],
      failedMessageIds: [...this.failedMessageIds],
    };
  }

  /**
   * Cancels the current batch analysis.
   *
   * @returns Promise resolving when cancellation is complete
   *
   * @example
   * ```typescript
   * await analyzeBatchEmails.cancel();
   * console.log('Batch cancelled');
   * ```
   */
  async cancel(): Promise<void> {
    if (!this.isProcessing) {
      this.logger.debug('No batch processing to cancel');
      return;
    }

    this.logger.info('Cancelling batch analysis');

    this.isCancelled = true;
    this.isProcessing = false;

    // Clear remaining items from queue
    const clearedCount = await this.queue.clear(false);

    // Resolve the batch promise with partial results
    if (this.resolvePromise) {
      const result: BatchAnalysisResult = {
        total: this.totalCount,
        successCount: this.processedCount,
        failureCount: this.failedCount,
        results: this.analysisResults,
        cancelled: true,
      };
      this.resolvePromise(result);
    }

    this.logger.info('Batch analysis cancelled', {
      processed: this.processedCount,
      failed: this.failedCount,
      remaining: clearedCount,
    });
  }

  /**
   * Checks if a batch is currently running.
   *
   * @returns True if a batch is running, false otherwise
   *
   * @example
   * ```typescript
   * if (await analyzeBatchEmails.isRunning()) {
   *   console.log('Batch is in progress');
   * }
   * ```
   */
  async isRunning(): Promise<boolean> {
    return this.isProcessing;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Loads application configuration from ConfigRepository.
   *
   * @returns Application config with fallback to defaults
   */
  private async loadAppConfig(): Promise<{
    defaultProvider: string;
    modelConcurrencyLimits:
      | import('@/infrastructure/interfaces/IConfigRepository').IModelConcurrencyConfig[]
      | undefined;
  }> {
    try {
      const appConfig = await this.configRepository.getAppConfig();
      return {
        defaultProvider: appConfig.defaultProvider,
        modelConcurrencyLimits: appConfig.modelConcurrencyLimits,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to load app config from ConfigRepository, using defaults', {
        error: errorMessage,
      });
      return {
        defaultProvider: 'openai',
        modelConcurrencyLimits: undefined,
      };
    }
  }

  /**
   * Gets concurrency limit from AppConfig or defaults.
   *
   * @param appConfig - Application configuration
   * @param providerSettings - Provider settings
   * @returns Concurrency limit
   */
  private getConcurrencyLimit(
    appConfig: {
      defaultProvider: string;
      modelConcurrencyLimits:
        | import('@/infrastructure/interfaces/IConfigRepository').IModelConcurrencyConfig[]
        | undefined;
    },
    providerSettings: IProviderSettings
  ): number {
    const providerId = (providerSettings.provider as string) ?? appConfig.defaultProvider;
    const model = (providerSettings.model as string) ?? '';

    // Check model-specific concurrency
    if (appConfig.modelConcurrencyLimits) {
      const modelConfig = appConfig.modelConcurrencyLimits.find(
        (c) => c.provider === providerId && c.model === model
      );
      if (modelConfig && modelConfig.concurrency > 0) {
        return modelConfig.concurrency;
      }

      // Check provider-specific concurrency
      const providerConfig = appConfig.modelConcurrencyLimits.find(
        (c) => c.provider === providerId && !c.model
      );
      if (providerConfig && providerConfig.concurrency > 0) {
        return providerConfig.concurrency;
      }
    }

    // Return default concurrency
    return DEFAULT_BATCH_CONFIG.DEFAULT_CONCURRENCY;
  }

  /**
   * Starts a worker process for processing queue items.
   *
   * @param delayBetweenAnalyses - Delay in milliseconds between analyses
   * @param continueOnError - Whether to continue processing on error
   * @returns Promise resolving when worker completes
   */
  private async startWorker(delayBetweenAnalyses: number, continueOnError: boolean): Promise<void> {
    this.logger.debug('Starting worker process');

    try {
      while (this.isProcessing && !this.isCancelled) {
        // Dequeue next item
        const item = await this.queue.dequeue<QueueItem>();

        if (item === null) {
          // Queue is empty
          break;
        }

        // Process the item
        await this.processQueueItem(item);

        // Delay between analyses if configured
        if (delayBetweenAnalyses > 0) {
          await this.sleep(delayBetweenAnalyses);
        }
      }

      this.logger.debug('Worker process completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Worker process failed', { error: errorMessage });

      if (!continueOnError) {
        this.isProcessing = false;
        this.isCancelled = true;
      }
    }
  }

  /**
   * Processes a single queue item.
   *
   * @param item - Queue item to process
   * @returns Promise resolving when item is processed
   */
  private async processQueueItem(item: QueueItem): Promise<void> {
    const { messageId, providerSettings } = item;

    this.logger.debug('Processing queue item', { messageId });

    try {
      // Analyze the email
      const result = await this.analyzeEmail.execute(messageId, providerSettings);

      // Record successful analysis
      this.processedCount++;
      this.processedMessageIds.push(messageId);
      this.analysisResults.push({
        messageId,
        success: true,
        tags: result.tags,
      });

      this.logger.debug('Email analyzed successfully', {
        messageId,
        tags: result.tags,
        confidence: result.confidence,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Record failed analysis
      this.failedCount++;
      this.failedMessageIds.push(messageId);
      this.analysisResults.push({
        messageId,
        success: false,
        error: errorMessage,
      });

      this.logger.error('Failed to analyze email', { messageId, error: errorMessage });
    }
  }

  /**
   * Resets batch state.
   */
  private resetState(): void {
    this.isProcessing = false;
    this.isCancelled = false;
    this.processedCount = 0;
    this.failedCount = 0;
    this.totalCount = 0;
    this.processedMessageIds = [];
    this.failedMessageIds = [];
    this.analysisResults = [];
    this.resolvePromise = null;
    this.activeWorkers = [];
  }

  /**
   * Sleeps for the specified duration.
   *
   * @param ms - Duration in milliseconds
   * @returns Promise resolving after the duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
