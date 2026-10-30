/**
 * Message Handler Service
 *
 * Handles Thunderbird runtime messaging API for communication between
 * extension components (background, options page, content scripts).
 *
 * This service:
 * - Registers message handlers for runtime.onMessage events
 * - Processes incoming messages from other extension components
 * - Coordinates with use cases for batch analysis, queue management, and caching
 * - Handles error cases and provides meaningful responses
 *
 * @module interfaces/background/MessageHandler
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/domain/interfaces';
import type { ICache, ICacheStats } from '@/infrastructure/interfaces/ICache';
import type { IQueue, IQueueStats } from '@/infrastructure/interfaces/IQueue';
import type { ITagManager } from '@/domain/interfaces';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';
import { AnalyzeEmail, LOW_CONFIDENCE_INDEX_KEY } from '@/application/use-cases/AnalyzeEmail';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import { AppConfigService } from '@/infrastructure/config/AppConfig';
import { MemoryCache } from '@/infrastructure/cache/MemoryCache';
import type { DebugLogBuffer } from '@/infrastructure/logger/DebugLogBuffer';
import { ProviderSettingsService } from '@/interfaces/shared/ProviderSettingsService';

/** Runtime onMessage event registry (not part of the central thunderbird.d.ts). */
interface RuntimeOnMessageRegistry {
  addListener(
    callback: (
      message: unknown,
      sender: unknown,
      sendResponse: (response?: unknown) => void
    ) => boolean
  ): void;
  removeListener(
    callback: (
      message: unknown,
      sender: unknown,
      sendResponse: (response?: unknown) => void
    ) => boolean
  ): void;
}

/**
 * Gets the runtime.onMessage registry from browser or messenger globals.
 */
function getRuntimeOnMessage(): RuntimeOnMessageRegistry | undefined {
  const globals = globalThis as unknown as {
    browser?: { runtime?: { onMessage?: RuntimeOnMessageRegistry } };
    messenger?: { runtime?: { onMessage?: RuntimeOnMessageRegistry } };
  };

  return globals.browser?.runtime?.onMessage ?? globals.messenger?.runtime?.onMessage;
}

// ============================================================================
// Type Definitions
// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Discriminated union for runtime message actions.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type RuntimeMessage =
  | StartBatchAnalysisMessage
  | GetBatchProgressMessage
  | CancelBatchAnalysisMessage
  | AnalyzeSingleMessageMessage
  | ClearQueueMessage
  | ClearCacheMessage
  | GetCacheStatsMessage
  | ApplyTagManuallyMessage
  | DismissTagMessage;

/**
 * Start batch analysis message.
 */
interface StartBatchAnalysisMessage {
  action: 'startBatchAnalysis';
  folderId?: string;
}

/**
 * Get batch progress message.
 */
interface GetBatchProgressMessage {
  action: 'getBatchProgress';
}

/**
 * Cancel batch analysis message.
 */
interface CancelBatchAnalysisMessage {
  action: 'cancelBatchAnalysis';
}

/**
 * Analyze single message message.
 */
interface AnalyzeSingleMessageMessage {
  action: 'analyzeSingleMessage';
  messageId: string;
}

/**
 * Clear queue message.
 */
interface ClearQueueMessage {
  action: 'clearQueue';
  cancelRunning?: boolean;
}

/**
 * Clear cache message.
 */
interface ClearCacheMessage {
  action: 'clearCache';
}

/**
 * Get cache stats message.
 */
interface GetCacheStatsMessage {
  action: 'getCacheStats';
}

/**
 * Apply tag manually message.
 */
interface ApplyTagManuallyMessage {
  action: 'applyTagManually';
  tagKey: string;
  confidence: number;
  /** Message to apply the tag to (required for a real effect) */
  messageId?: string;
}

/**
 * Dismiss tag message.
 */
interface DismissTagMessage {
  action: 'dismissTag';
  tagKey: string;
}

/**
 * Discriminated union for runtime message responses.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type RuntimeMessageResponse =
  | StartBatchAnalysisResult
  | BatchProgress
  | { success: boolean; message: string }
  | AnalyzeSingleMessageResult
  | ClearQueueResult
  | { success: boolean; message?: string; totalEntries?: number; hitRate?: number };

/**
 * Batch progress information.
 */
interface BatchProgress {
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  total: number;
  processed: number;
  successful: number;
  failed: number;
  startTime: number;
  endTime?: number;
  errorMessage?: string;
}

/**
 * Start batch analysis result.
 */
interface StartBatchAnalysisResult {
  success: boolean;
  messageCount?: number;
  error?: string;
}

/**
 * Analyze single message result.
 */
interface AnalyzeSingleMessageResult {
  success: boolean;
  message: string;
  tags?: string[];
}

/**
 * Clear queue result.
 */
interface ClearQueueResult {
  success: boolean;
  clearedTasks: number;
  cancelledProviders: string[];
  providers: Record<string, { queueLength: number; isProcessing: boolean }>;
}

/**
 * Message handler state.
 */
interface HandlerState {
  /** Whether handlers are registered */
  isRegistered: boolean;
  /** Number of messages handled */
  messagesHandled: number;
  /** Number of errors encountered */
  errorsEncountered: number;
}

// ============================================================================
// Message Action Helper
// ============================================================================

/**
 * Extracts the `action` discriminator from an arbitrary runtime message.
 */
function getMessageAction(message: unknown): string | undefined {
  if (typeof message === 'object' && message !== null && 'action' in message) {
    const action = (message as Record<string, unknown>).action;
    return typeof action === 'string' ? action : undefined;
  }
  return undefined;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Message Handler Service
 *
 * Handles runtime messaging for extension components.
 * Coordinates with use cases to process incoming messages.
 *
 * @example
 * ```typescript
 * const service = container.resolve<MessageHandler>(MessageHandler);
 *
 * // Start handling messages
 * service.start();
 *
 * // Later, stop handling messages
 * service.stop();
 * ```
 */
@injectable()
export class MessageHandler {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly analyzeEmail: AnalyzeEmail;
  private readonly analyzeBatch: AnalyzeBatchEmails;
  private readonly logger: ILogger;
  private readonly providerSettingsService: ProviderSettingsService;
  private readonly queue: IQueue;
  private readonly cache: ICache;
  private readonly tagManager: ITagManager;
  private readonly debugLogBuffer: DebugLogBuffer;

  /** Action -> handler dispatch table (replaces 14 copy-paste type guards). */
  private readonly messageHandlers: Record<
    string,
    (message: unknown) => unknown | Promise<unknown>
  >;

  private handlerState: HandlerState = {
    isRegistered: false,
    messagesHandled: 0,
    errorsEncountered: 0,
  };

  // Cached function reference for proper listener removal
  private handleMessageHandler:
    | ((message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean)
    | null = null;

  // Batch progress tracking (simplified for this service)
  private batchProgress: BatchProgress = {
    status: 'idle',
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    startTime: 0,
  };

  // ==========================================================================
  // Constructor
  // ==========================================================================

  /**
   * Creates a new MessageHandler instance.
   *
   * @param analyzeEmail - Single email analysis use case
   * @param analyzeBatch - Batch email analysis use case
   * @param logger - Logger instance for logging operations
   * @param appConfigService - App config service for loading provider settings
   * @param queue - Queue for clearQueue operations
   * @param cache - Cache for clearCache/getCacheStats operations
   * @param tagManager - Tag manager for manual tag application
   * @param debugLogBuffer - Debug log buffer for debug log operations
   */
  constructor(
    @inject(AnalyzeEmail) analyzeEmail: AnalyzeEmail,
    @inject(AnalyzeBatchEmails) analyzeBatch: AnalyzeBatchEmails,
    @inject('ILogger') logger: ILogger,
    @inject(AppConfigService) appConfigService: AppConfigService,
    @inject('IQueue') queue: IQueue,
    @inject('ICache') cache: ICache,
    @inject('ITagManager') tagManager: ITagManager,
    @inject('DebugLogBuffer') debugLogBuffer: DebugLogBuffer
  ) {
    this.analyzeEmail = analyzeEmail;
    this.analyzeBatch = analyzeBatch;
    this.logger = logger;
    this.providerSettingsService = new ProviderSettingsService(appConfigService, logger);
    this.queue = queue;
    this.cache = cache;
    this.tagManager = tagManager;
    this.debugLogBuffer = debugLogBuffer;

    this.messageHandlers = {
      startBatchAnalysis: (m) => this.handleStartBatchAnalysis(m as StartBatchAnalysisMessage),
      getBatchProgress: () => this.handleGetBatchProgress(),
      cancelBatchAnalysis: () => this.handleCancelBatchAnalysis(),
      analyzeSingleMessage: (m) =>
        this.handleAnalyzeSingleMessage(m as AnalyzeSingleMessageMessage),
      clearQueue: (m) => this.handleClearQueue(m as ClearQueueMessage),
      clearCache: () => this.handleClearCache(),
      getCacheStats: () => this.handleGetCacheStats(),
      getDebugLogs: () => this.handleGetDebugLogs(),
      clearDebugLogs: () => this.handleClearDebugLogs(),
      getQueueStats: () => this.handleGetQueueStats(),
      applyTagManually: (m) => this.handleApplyTagManually(m as ApplyTagManuallyMessage),
      dismissTag: (m) => this.handleDismissTag(m as DismissTagMessage),
    };

    this.logger.debug('MessageHandler service initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Registers message handlers.
   *
   * Sets up handler for browser.runtime.onMessage events.
   */
  registerMessageHandlers(): void {
    if (this.handlerState.isRegistered) {
      this.logger.warn('Message handlers already registered');
      return;
    }

    this.logger.debug('Registering runtime message handlers');

    this.handleMessageHandler = this.handleMessage.bind(this);

    const onMessage = getRuntimeOnMessage();

    if (onMessage) {
      onMessage.addListener(this.handleMessageHandler);
      this.handlerState.isRegistered = true;
      this.logger.info('Runtime message handler registered');
    } else {
      this.logger.error('Runtime messaging API not available');
    }
  }

  /**
   * Unregisters message handlers.
   *
   * Removes all registered message handlers.
   */
  unregisterMessageHandlers(): void {
    if (!this.handlerState.isRegistered) {
      this.logger.debug('Message handlers not registered');
      return;
    }

    this.logger.info('Unregistering runtime message handlers');

    if (this.handleMessageHandler) {
      const onMessage = getRuntimeOnMessage();

      if (onMessage) {
        onMessage.removeListener(this.handleMessageHandler);
        this.logger.info('Runtime message handler unregistered');
      }
      this.handleMessageHandler = null;
    }

    this.handlerState.isRegistered = false;
    this.logger.info('Runtime message handlers unregistered');
  }

  /**
   * Starts the message handler service.
   *
   * Registers all message handlers and begins processing messages.
   */
  start(): void {
    this.logger.info('Starting message handler service');
    this.registerMessageHandlers();
  }

  /**
   * Stops the message handler service.
   *
   * Unregisters all message handlers and stops processing messages.
   */
  stop(): void {
    this.logger.info('Stopping message handler service');
    this.unregisterMessageHandlers();
  }

  /**
   * Gets current handler state.
   *
   * @returns Current state of message handlers
   */
  getState(): HandlerState {
    return { ...this.handlerState };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Handles incoming runtime messages.
   *
   * Routes messages to appropriate handlers based on action type.
   *
   * @param message - The received message
   * @param sender - Message sender information
   * @param sendResponse - Function to send response back
   * @returns true if response is sent asynchronously, false otherwise
   */
  private handleMessage(
    message: unknown,
    _sender: unknown,
    sendResponse: (response?: unknown) => void
  ): boolean {
    const action = getMessageAction(message);
    this.logger.debug('Runtime message received', { action });
    this.handlerState.messagesHandled++;

    const handler = action ? this.messageHandlers[action] : undefined;

    // #19: unknown actions are answered synchronously and release the channel.
    if (!handler) {
      this.logger.warn('Unknown runtime message received', { action });
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
    }

    // Known actions answer asynchronously.
    (async () => {
      try {
        sendResponse(await handler(message));
      } catch (error) {
        this.handlerState.errorsEncountered++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Internal error processing message', {
          action,
          error: errorMessage,
        });

        sendResponse({ success: false, message: 'Internal error processing message' });
      }
    })();

    return true;
  }

  /**
   * Handles start batch analysis message.
   *
   * @param message - Start batch analysis message
   * @returns Start batch analysis result
   */
  private async handleStartBatchAnalysis(
    message: StartBatchAnalysisMessage
  ): Promise<StartBatchAnalysisResult> {
    this.logger.info('Handling startBatchAnalysis message', { folderId: message.folderId });

    try {
      // Check if another batch is already running
      if (this.batchProgress.status === 'running') {
        return {
          success: false,
          error: 'Batch analysis is already running. Cancel the current batch first.',
        };
      }

      // Get provider settings
      const providerSettings = await this.getProviderSettings();

      if (!providerSettings.provider) {
        return {
          success: false,
          error: 'No provider configured. Please check your settings.',
        };
      }

      // Get messages to analyze
      const messageIds = await this.providerSettingsService.getMessagesToAnalyze(message.folderId);

      if (messageIds.length === 0) {
        return {
          success: false,
          error: 'No messages found to analyze.',
        };
      }

      // Initialize batch progress
      this.batchProgress = {
        status: 'running',
        total: messageIds.length,
        processed: 0,
        successful: 0,
        failed: 0,
        startTime: Date.now(),
      };

      // Execute batch analysis and wait for completion
      try {
        const result = await this.analyzeBatch.execute(messageIds, {
          providerSettings,
          priority: 1,
          concurrency: 3,
        });

        this.batchProgress = {
          ...this.batchProgress,
          status: 'completed',
          processed: result.total,
          successful: result.successCount,
          failed: result.failureCount,
          endTime: Date.now(),
        };
        this.logger.info('Batch analysis completed', result as unknown as Record<string, unknown>);

        return {
          success: true,
          messageCount: messageIds.length,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.batchProgress = {
          ...this.batchProgress,
          status: 'error',
          endTime: Date.now(),
          errorMessage,
        };
        this.logger.error('Batch analysis failed', { error: errorMessage });

        return {
          success: false,
          error: `Batch analysis failed: ${errorMessage}`,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to start batch analysis', { error: errorMessage });
      return {
        success: false,
        error: `Failed to start batch analysis: ${errorMessage}`,
      };
    }
  }

  /**
   * Handles get batch progress message.
   *
   * Reads live state from AnalyzeBatchEmails.getProgress() so mid-batch
   * queries reflect actual processed counts. startTime/endTime come from
   * this handler (only it knows when the batch was started locally).
   *
   * @returns Promise resolving to current batch progress
   */
  private async handleGetBatchProgress(): Promise<BatchProgress> {
    const progress = await this.analyzeBatch.getProgress();

    let status: BatchProgress['status'];
    if (progress.isRunning) {
      status = 'running';
    } else if (progress.isCancelled) {
      status = 'cancelled';
    } else if (progress.total > 0 && progress.processed + progress.failed > 0) {
      status = 'completed';
    } else {
      status = 'idle';
    }

    return {
      status,
      total: progress.total,
      processed: progress.processed,
      successful: progress.processed,
      failed: progress.failed,
      startTime: this.batchProgress.startTime,
      endTime: status === 'running' ? undefined : this.batchProgress.endTime,
    };
  }

  /**
   * Handles cancel batch analysis message.
   *
   * @returns Cancel result
   */
  private async handleCancelBatchAnalysis(): Promise<{ success: boolean; message: string }> {
    this.logger.info('Handling cancelBatchAnalysis message');

    // O2: the real batch state wins — a batch started from the context menu
    // never touched this handler's local batchProgress.
    const batchRunning = await this.analyzeBatch.isRunning();

    if (!batchRunning && this.batchProgress.status !== 'running') {
      return {
        success: false,
        message: 'No batch analysis is currently running.',
      };
    }

    try {
      await this.analyzeBatch.cancel();

      this.batchProgress = {
        ...this.batchProgress,
        status: 'cancelled',
        endTime: Date.now(),
      };

      this.logger.info('Batch analysis cancelled');

      return {
        success: true,
        message: 'Batch analysis cancelled successfully.',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to cancel batch analysis', { error: errorMessage });
      return {
        success: false,
        message: `Failed to cancel batch analysis: ${errorMessage}`,
      };
    }
  }

  /**
   * Handles analyze single message message.
   *
   * @param message - Analyze single message message
   * @returns Analyze single message result
   */
  private async handleAnalyzeSingleMessage(
    message: AnalyzeSingleMessageMessage
  ): Promise<AnalyzeSingleMessageResult> {
    this.logger.debug('handleAnalyzeSingleMessage entered', {
      messageId: message.messageId,
    });

    try {
      const providerSettings = await this.getProviderSettings();

      if (!providerSettings.provider) {
        return {
          success: false,
          message: 'No provider configured. Please check your settings.',
        };
      }

      const result = await this.analyzeEmail.execute(message.messageId, providerSettings);

      return {
        success: true,
        message: 'Message analyzed successfully',
        tags: result.tags,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Failed to analyze single message', {
        messageId: message.messageId,
        error: errorMessage,
        stack: errorStack,
      });
      return {
        success: false,
        message: `Analysis failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Handles clear queue message.
   *
   * Clears the real queue via IQueue and reports actual statistics.
   *
   * @param message - Clear queue message
   * @returns Clear queue result
   */
  private async handleClearQueue(message: ClearQueueMessage): Promise<ClearQueueResult> {
    this.logger.info('Handling clearQueue message', { cancelRunning: message.cancelRunning });

    try {
      // #11: If a batch is running, cancel the use case instead of clearing the
      // global queue singleton underneath it (which left execute() reporting
      // "completed" without the cancelled flag).
      const batchRunning = await this.analyzeBatch.isRunning();

      if (batchRunning) {
        await this.analyzeBatch.cancel();
        this.batchProgress = {
          ...this.batchProgress,
          status: 'cancelled',
          endTime: Date.now(),
        };

        const stats: IQueueStats = await this.queue.getStats();
        return {
          success: true,
          clearedTasks: 0,
          cancelledProviders: [],
          providers: {
            queue: { queueLength: stats.waiting, isProcessing: stats.processing > 0 },
          },
        };
      }

      const clearedTasks = await this.queue.clear(message.cancelRunning ?? false);
      const stats: IQueueStats = await this.queue.getStats();

      return {
        success: true,
        clearedTasks,
        cancelledProviders: [],
        providers: {
          queue: { queueLength: stats.waiting, isProcessing: stats.processing > 0 },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to clear queue', { error: errorMessage });
      return {
        success: false,
        clearedTasks: 0,
        cancelledProviders: [],
        providers: {},
      };
    }
  }

  /**
   * Handles clear cache message.
   *
   * Clears the real cache via ICache.
   *
   * @returns Clear cache result
   */
  private async handleClearCache(): Promise<{ success: boolean; message: string }> {
    this.logger.info('Handling clearCache message');

    try {
      await this.cache.clear();
      return { success: true, message: 'Cache cleared successfully' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to clear cache', { error: errorMessage });
      return { success: false, message: `Failed to clear cache: ${errorMessage}` };
    }
  }

  /**
   * Handles getDebugLogs message.
   *
   * Returns the debug log buffer contents (newest-first) and the count of
   * entries evicted before pickup.
   *
   * @returns Debug log entries and dropped count
   */
  private handleGetDebugLogs(): {
    success: true;
    entries: import('@/infrastructure/logger/DebugLogBuffer').DebugLogEntry[];
    droppedCount: number;
    /** Optional: swallowed cache-operation errors since start (issue #8) */
    cacheErrorCount?: number;
  } {
    // debug: polling endpoint — info here would spam the log on every UI refresh
    this.logger.debug('Handling getDebugLogs message');

    return {
      success: true,
      entries: this.debugLogBuffer.getEntries(),
      droppedCount: this.debugLogBuffer.getDroppedCount(),
      cacheErrorCount: this.getCacheErrorCount(),
    };
  }

  /**
   * Handles clearDebugLogs message.
   *
   * Clears the debug log buffer, its session mirror, and the dropped count.
   *
   * @returns Success confirmation
   */
  private handleClearDebugLogs(): { success: true } {
    this.logger.info('Handling clearDebugLogs message');

    this.debugLogBuffer.clear();

    return { success: true };
  }

  /**
   * Handles getQueueStats message.
   *
   * Returns live queue statistics (from PriorityQueue.getStats()) plus the
   * batch progress verbatim.
   *
   * @returns Queue stats and batch progress
   */
  private async handleGetQueueStats(): Promise<{
    success: true;
    queue: IQueueStats;
    batch: Awaited<ReturnType<AnalyzeBatchEmails['getProgress']>>;
  }> {
    // debug: polling endpoint — info here would spam the log on every UI refresh
    this.logger.debug('Handling getQueueStats message');

    const queue = await this.queue.getStats();
    const batch = await this.analyzeBatch.getProgress();

    return { success: true, queue, batch };
  }

  /**
   * Handles get cache stats message.
   *
   * Reads real statistics from ICache.
   *
   * @returns Cache stats
   */
  private async handleGetCacheStats(): Promise<{
    success: boolean;
    totalEntries?: number;
    hitRate?: number;
    /** Optional: swallowed cache-operation errors since start (issue #8) */
    cacheErrorCount?: number;
    message?: string;
  }> {
    this.logger.info('Handling getCacheStats message');

    try {
      const stats: ICacheStats = await this.cache.getStats();
      return {
        success: true,
        totalEntries: stats.totalEntries,
        hitRate: stats.hitRate,
        cacheErrorCount: this.getCacheErrorCount(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get cache stats', { error: errorMessage });
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Swallowed cache-operation error count (issue #8). Only the MemoryCache
   * implementation tracks it; other ICache implementations report 0.
   */
  private getCacheErrorCount(): number {
    return this.cache instanceof MemoryCache ? this.cache.getErrorCount() : 0;
  }

  /**
   * Handles apply tag manually message.
   *
   * Applies the tag to the referenced message via ITagManager and removes
   * the corresponding low-confidence flag from storage.
   *
   * @param message - Apply tag manually message
   * @returns Apply tag result
   */
  private async handleApplyTagManually(message: ApplyTagManuallyMessage): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    this.logger.info('Handling applyTagManually message', { tagKey: message.tagKey });

    try {
      if (!message.messageId) {
        return {
          success: false,
          error: 'messageId is required to apply a tag',
        };
      }

      const messageIdNum = parseInt(message.messageId, 10);
      if (Number.isNaN(messageIdNum)) {
        return { success: false, error: `Invalid messageId: ${message.messageId}` };
      }

      await this.tagManager.addTagToMessage(messageIdNum, message.tagKey);
      await this.removeLowConfidenceFlag(message.tagKey);

      return {
        success: true,
        message: `Tag "${message.tagKey}" wurde erfolgreich angewendet.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to apply tag manually', { error: errorMessage });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handles dismiss tag message.
   *
   * Removes the tag suggestion from all stored low-confidence flags.
   *
   * @param message - Dismiss tag message
   * @returns Dismiss tag result
   */
  private async handleDismissTag(message: DismissTagMessage): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    this.logger.info('Handling dismissTag message', { tagKey: message.tagKey });

    try {
      const removed = await this.removeLowConfidenceFlag(message.tagKey);

      if (!removed) {
        return {
          success: false,
          error: `No stored suggestion for tag "${message.tagKey}" found`,
        };
      }

      return {
        success: true,
        message: `Tag "${message.tagKey}" wurde abgelehnt.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to dismiss tag', { error: errorMessage });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Gets provider settings via the shared ProviderSettingsService.
   *
   * @returns Provider settings
   */
  private getProviderSettings(): Promise<IProviderSettings> {
    return this.providerSettingsService.getProviderSettings();
  }

  /**
   * Removes a tag suggestion from the stored low-confidence flags.
   *
   * Low-confidence flags are stored by AnalyzeEmail under `lowConfidence_<cacheKey>`
   * keys, bounded by the `lowConfidenceIndex` key (cacheKey -> timestamp). The
   * index is read to resolve the concrete entry keys, so only those entries are
   * loaded — never a full `storage.local` scan.
   *
   * @param tagKey - Tag key to remove
   * @returns Promise resolving to true if at least one flag was removed
   */
  private async removeLowConfidenceFlag(tagKey: string): Promise<boolean> {
    const indexResult = await messenger.storage.local.get(LOW_CONFIDENCE_INDEX_KEY);
    const rawIndex = indexResult[LOW_CONFIDENCE_INDEX_KEY];
    const index =
      typeof rawIndex === 'object' && rawIndex !== null
        ? { ...(rawIndex as Record<string, number>) }
        : {};

    const keys = Object.keys(index).map((cacheKey) => `lowConfidence_${cacheKey}`);
    if (keys.length === 0) {
      return false;
    }

    const entries = await messenger.storage.local.get(keys);
    const removalKeys: string[] = [];
    let removed = false;

    for (const [key, value] of Object.entries(entries)) {
      const entry = value as { cacheKey?: string; flags?: Array<{ tagKey: string }> };
      const flags = entry.flags ?? [];
      const remaining = flags.filter((f) => f.tagKey !== tagKey);

      if (remaining.length === flags.length) continue;

      removed = true;

      if (remaining.length === 0) {
        // No suggestions left for this email: delete the entry (N3a:
        // `storage.local.remove` is the only API that deletes on Gecko) and
        // drop it from the index.
        removalKeys.push(key);
        const cacheKey = entry.cacheKey ?? key.replace(/^lowConfidence_/, '');
        delete index[cacheKey];
      } else {
        await messenger.storage.local.set({ [key]: { ...entry, flags: remaining } });
      }
    }

    if (removalKeys.length > 0) {
      await messenger.storage.local.remove(removalKeys);
      await messenger.storage.local.set({ [LOW_CONFIDENCE_INDEX_KEY]: index });
    }

    return removed;
  }

  /**
   * Gets messages to analyze via the shared ProviderSettingsService.
   *
   * @param folderId - Optional folder ID to filter messages
   * @returns Array of message IDs to analyze
   */
  private getMessagesToAnalyze(folderId?: string): Promise<string[]> {
    return this.providerSettingsService.getMessagesToAnalyze(folderId);
  }
}
