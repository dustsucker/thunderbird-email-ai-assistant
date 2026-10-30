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

import { injectable, inject, container } from 'tsyringe';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';
import type { ILogger } from '@/domain/interfaces';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import { ConfigNotSetError } from '@/infrastructure/repositories/StorageLocalConfigRepository';
import { AnalyzeEmail, isAbortError } from './AnalyzeEmail';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';
import { EmailAnalysisTracker } from '../services/EmailAnalysisTracker';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Progress tracking information for batch analysis.
 *
 * The ID arrays are optional: live progress notifications only carry counts
 * (to avoid O(n²) cloning); call `getProgress()` when the IDs are needed.
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
  /** Message IDs that have been processed (populated by getProgress) */
  processedMessageIds?: string[];
  /** Message IDs that failed to process (populated by getProgress) */
  failedMessageIds?: string[];
}

/**
 * Listener notified on batch progress changes (used e.g. for the toolbar badge).
 */
export interface BatchProgressListener {
  /** Called after each processed/failed item and on completion/cancel/error. */
  onBatchProgress(progress: BatchProgress): void;
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
  /** Number of analyses cancelled via abort (not counted as failures) */
  cancelledCount: number;
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
  private readonly emailAnalysisTracker: EmailAnalysisTracker;

  // Batch state
  private isProcessing = false;
  private isCancelled = false;
  private processedCount = 0;
  private failedCount = 0;
  private cancelledCount = 0;
  private totalCount = 0;
  private processedMessageIds: string[] = [];
  private failedMessageIds: string[] = [];
  private analysisResults: EmailAnalysisResult[] = [];
  private activeWorkers: Promise<void>[] = [];
  /** Aborts in-flight provider requests when cancel() is called. */
  private abortController: AbortController | null = null;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor(
    @inject(AnalyzeEmail) analyzeEmail: AnalyzeEmail,
    @inject('IQueue') queue: IQueue,
    @inject('ILogger') logger: ILogger,
    @inject('IConfigRepository') configRepository: IConfigRepository,
    @inject(EmailAnalysisTracker) emailAnalysisTracker: EmailAnalysisTracker
  ) {
    this.analyzeEmail = analyzeEmail;
    this.queue = queue;
    this.logger = logger;
    this.configRepository = configRepository;
    this.emailAnalysisTracker = emailAnalysisTracker;
    this.logger.debug('[DEBUG] AnalyzeBatchEmails use case initialized');
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
    this.logger.info('[INFO] Starting batch email analysis', {
      messageCount: messageIds.length,
      provider: config.providerSettings.provider,
      config: {
        priority: config.priority,
        concurrency: config.concurrency,
        delayBetweenAnalyses: config.delayBetweenAnalyses,
        continueOnError: config.continueOnError,
      },
    });

    // Load batch settings from AppConfig with fallback to defaults
    this.logger.debug('[DEBUG] Loading app config for concurrency limits');
    const appConfig = await this.loadAppConfig();
    const concurrency =
      config.concurrency ?? this.getConcurrencyLimit(appConfig, config.providerSettings);
    const priority = config.priority ?? DEFAULT_BATCH_CONFIG.DEFAULT_PRIORITY;
    const delayBetweenAnalyses =
      config.delayBetweenAnalyses ?? DEFAULT_BATCH_CONFIG.DEFAULT_DELAY_BETWEEN_ANALYSES;
    const continueOnError =
      config.continueOnError ?? DEFAULT_BATCH_CONFIG.DEFAULT_CONTINUE_ON_ERROR;

    this.logger.debug('[DEBUG] Batch configuration loaded', {
      concurrency,
      priority,
      delayBetweenAnalyses,
      continueOnError,
    });

    if (this.isProcessing) {
      this.logger.error('[ERROR] Batch analysis already running');
      throw new Error('Batch analysis is already running. Wait for current batch to complete.');
    }

    this.logger.info('[INFO] Starting batch processing', {
      count: messageIds.length,
      priority,
      concurrency,
    });

    const startTime = Date.now();

    try {
      // Initialize batch state
      this.logger.debug('[DEBUG] Initializing batch state');
      this.isProcessing = true;
      this.isCancelled = false;
      this.processedCount = 0;
      this.failedCount = 0;
      this.cancelledCount = 0;
      this.totalCount = messageIds.length;
      this.processedMessageIds = [];
      this.failedMessageIds = [];
      this.analysisResults = [];
      this.abortController = new AbortController();
      this.logger.debug('[DEBUG] Batch state initialized');
      this.notifyProgress();

      // Enqueue all messages
      this.logger.debug('[DEBUG] Enqueuing messages', { count: messageIds.length });
      for (const messageId of messageIds) {
        const queueItem: QueueItem = {
          messageId,
          providerSettings: config.providerSettings,
        };
        await this.queue.enqueue(queueItem, priority);
      }

      this.logger.debug('[DEBUG] All messages enqueued', { count: messageIds.length });

      // Start worker processes
      this.logger.debug('[DEBUG] Starting worker processes', { workerCount: concurrency });
      for (let i = 0; i < concurrency; i++) {
        this.activeWorkers.push(this.startWorker(delayBetweenAnalyses, continueOnError));
      }
      this.logger.debug('[DEBUG] Workers started');

      // Wait for all workers to complete
      this.logger.debug('[DEBUG] Waiting for all workers to complete');
      await Promise.all(this.activeWorkers);
      this.logger.debug('[DEBUG] All workers completed');

      const result: BatchAnalysisResult = {
        total: this.totalCount,
        successCount: this.processedCount,
        failureCount: this.failedCount,
        cancelledCount: this.cancelledCount,
        results: this.analysisResults,
        cancelled: this.isCancelled,
      };

      this.logger.info('[INFO] Batch analysis completed', {
        total: result.total,
        success: result.successCount,
        failed: result.failureCount,
        cancelled: result.cancelledCount,
        duration: `${Date.now() - startTime}ms`,
      });

      // Notify BEFORE resetState so the listener sees final counts (badge clear)
      this.notifyProgress();
      this.resetState();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[ERROR] Batch analysis failed', { error: errorMessage });

      // Notify BEFORE resetState so the listener sees the error end-state
      this.notifyProgress();

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
   * Sets the cancel flag, clears the queue and aborts in-flight provider
   * requests (via the batch AbortController) so no further API cost accrues.
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
      this.logger.debug('[DEBUG] No batch processing to cancel');
      return;
    }

    this.logger.info('[INFO] Cancelling batch analysis');

    this.isCancelled = true;
    this.isProcessing = false;

    // Abort in-flight provider requests immediately
    this.abortController?.abort();
    this.notifyProgress();

    // Clear remaining items from queue
    this.logger.debug('[DEBUG] Clearing queue');
    const clearedCount = await this.queue.clear(false);
    this.logger.debug('[DEBUG] Queue cleared', { clearedCount });

    this.logger.info('[INFO] Batch analysis cancelled', {
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
   * Issue #33: only a missing key gets defaults; a storage read error
   * propagates and aborts the batch instead of running with the wrong
   * provider assumption.
   *
   * @returns Application config with fallback to defaults when not set
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
      if (error instanceof ConfigNotSetError) {
        this.logger.debug('App config not set, using batch defaults', { error: error.message });
        return {
          defaultProvider: 'openai',
          modelConcurrencyLimits: undefined,
        };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to load app config from ConfigRepository', {
        error: errorMessage,
      });
      throw error;
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
    this.logger.debug('[DEBUG] Starting worker process', { delayBetweenAnalyses, continueOnError });

    try {
      while (this.isProcessing && !this.isCancelled) {
        // Dequeue next item
        this.logger.debug('[DEBUG] Dequeueing next item');
        const item = await this.queue.dequeue<QueueItem>();

        if (item === null) {
          // Queue is empty
          this.logger.debug('[DEBUG] Queue is empty, worker stopping');
          break;
        }

        this.logger.debug('[DEBUG] Item dequeued', { messageId: item.messageId });

        // Process the item, then mark it complete so queue stats stay honest
        try {
          await this.processQueueItem(item);
        } finally {
          await this.queue.complete?.(item);
        }

        // Delay between analyses if configured
        if (delayBetweenAnalyses > 0) {
          this.logger.debug('[DEBUG] Sleeping between analyses', { duration: delayBetweenAnalyses });
          await this.sleep(delayBetweenAnalyses);
        }
      }

      this.logger.debug('[DEBUG] Worker process completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[ERROR] Worker process failed', { error: errorMessage });

      if (!continueOnError) {
        this.logger.debug('[DEBUG] Stopping all workers (continueOnError=false)');
        this.isProcessing = false;
        this.isCancelled = true;
        this.notifyProgress();
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

    this.logger.debug('[DEBUG] Processing queue item', {
      messageId,
      provider: providerSettings.provider,
    });

    try {
      // Check if email was already analyzed
      const messageIdNum = parseInt(messageId, 10);
      if (await this.emailAnalysisTracker.wasAnalyzed(messageIdNum)) {
        this.logger.info('[INFO] Skipping already-analyzed email', { messageId });
        return;
      }

      // Analyze the email; the AnalyzeEmail in-flight map closes the TOCTOU
      // window against concurrent triggers, the signal propagates cancellation.
      this.logger.debug('[DEBUG] Calling analyzeEmail.execute()');
      const result = await this.analyzeEmail.execute(messageId, providerSettings, {
        signal: this.abortController?.signal,
      });

      // Record successful analysis
      this.processedCount++;
      this.processedMessageIds.push(messageId);
      this.analysisResults.push({
        messageId,
        success: true,
        tags: result.tags,
      });

      this.logger.debug('[DEBUG] Email analyzed successfully', {
        messageId,
        tags: result.tags,
        confidence: result.confidence,
        processed: `${this.processedCount}/${this.totalCount}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (isAbortError(error) || this.abortController?.signal.aborted === true) {
        // Cancelled items are not failures and must not count toward retries.
        this.cancelledCount++;
        this.analysisResults.push({
          messageId,
          success: false,
          error: 'Cancelled',
        });
        this.logger.debug('[DEBUG] Email analysis cancelled', { messageId });
      } else {
        // Record failed analysis
        this.failedCount++;
        this.failedMessageIds.push(messageId);
        this.analysisResults.push({
          messageId,
          success: false,
          error: errorMessage,
        });

        this.logger.error('[ERROR] Failed to analyze email', {
          messageId,
          error: errorMessage,
          failed: `${this.failedCount}/${this.totalCount}`,
        });
      }
    } finally {
      this.notifyProgress();
    }
  }

  /**
   * Notifies the registered batch progress listener (if any) with a live
   * progress snapshot. Used e.g. by the toolbar badge updater.
   *
   * Only counts/status are sent — not the growing ID arrays — to keep the
   * per-item cost O(1). Use {@link getProgress} to fetch IDs on demand.
   */
  private notifyProgress(): void {
    if (!container.isRegistered('BatchProgressListener')) return;

    try {
      const listener = container.resolve<BatchProgressListener>('BatchProgressListener');
      listener.onBatchProgress({
        total: this.totalCount,
        processed: this.processedCount,
        failed: this.failedCount,
        percentage:
          this.totalCount > 0
            ? Math.round(((this.processedCount + this.failedCount) / this.totalCount) * 100)
            : 0,
        isRunning: this.isProcessing,
        isCancelled: this.isCancelled,
      });
    } catch (error) {
      this.logger.warn('Failed to notify batch progress listener', {
        error: error instanceof Error ? error.message : String(error),
      });
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
    this.cancelledCount = 0;
    this.totalCount = 0;
    this.processedMessageIds = [];
    this.failedMessageIds = [];
    this.analysisResults = [];
    this.activeWorkers = [];
    this.abortController = null;
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
