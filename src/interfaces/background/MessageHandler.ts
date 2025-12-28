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
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import { ApplyTagsToEmail } from '@/application/use-cases/ApplyTagsToEmail';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';
import { EventBus } from '@/domain/events/EventBus';
import { createProviderErrorEvent } from '@/domain/events/ProviderErrorEvent';

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
  | GetCacheStatsMessage;

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
// Type Guards
// ============================================================================

/**
 * Type guard for StartBatchAnalysisMessage.
 */
function isStartBatchAnalysisMessage(message: unknown): message is StartBatchAnalysisMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'startBatchAnalysis'
  );
}

/**
 * Type guard for GetBatchProgressMessage.
 */
function isGetBatchProgressMessage(message: unknown): message is GetBatchProgressMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'getBatchProgress'
  );
}

/**
 * Type guard for CancelBatchAnalysisMessage.
 */
function isCancelBatchAnalysisMessage(message: unknown): message is CancelBatchAnalysisMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'cancelBatchAnalysis'
  );
}

/**
 * Type guard for AnalyzeSingleMessageMessage.
 */
function isAnalyzeSingleMessageMessage(message: unknown): message is AnalyzeSingleMessageMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'analyzeSingleMessage'
  );
}

/**
 * Type guard for ClearQueueMessage.
 */
function isClearQueueMessage(message: unknown): message is ClearQueueMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'clearQueue'
  );
}

/**
 * Type guard for ClearCacheMessage.
 */
function isClearCacheMessage(message: unknown): message is ClearCacheMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'clearCache'
  );
}

/**
 * Type guard for GetCacheStatsMessage.
 */
function isGetCacheStatsMessage(message: unknown): message is GetCacheStatsMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'getCacheStats'
  );
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
   * @param _applyTags - Tag application use case (reserved for future use)
   * @param logger - Logger instance for logging operations
   * @param configRepository - Config repository for loading provider settings
   */
  constructor(
    @inject(AnalyzeEmail) analyzeEmail: AnalyzeEmail,
    @inject(AnalyzeBatchEmails) analyzeBatch: AnalyzeBatchEmails,
    @inject(ApplyTagsToEmail) _applyTags: ApplyTagsToEmail,
    @inject('ILogger') logger: ILogger,
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject('IConfigRepository') private readonly configRepository: IConfigRepository
  ) {
    this.analyzeEmail = analyzeEmail;
    this.analyzeBatch = analyzeBatch;
    this.logger = logger;

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

    this.logger.info('Registering runtime message handlers');

    // Register message handler
    this.handleMessageHandler = this.handleMessage.bind(this);

    // Access global browser/messenger object (Thunderbird WebExtension API)
    // @ts-expect-error - browser is a global WebExtension API
    if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
      // @ts-expect-error - browser.runtime.onMessage is a WebExtension API
      browser.runtime.onMessage.addListener(this.handleMessageHandler);
      this.handlerState.isRegistered = true;
      this.logger.info('Runtime message handler registered');
    } else {
      // @ts-expect-error - messenger is a global Thunderbird API
      if (typeof messenger !== 'undefined' && messenger.runtime?.onMessage) {
        // @ts-expect-error - messenger.runtime.onMessage is a Thunderbird API
        messenger.runtime.onMessage.addListener(this.handleMessageHandler);
        this.handlerState.isRegistered = true;
        this.logger.info('Runtime message handler registered (messenger API)');
      } else {
        this.logger.warn('Runtime messaging API not available');
      }
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
      // @ts-expect-error - browser is a global WebExtension API
      if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
        // @ts-expect-error - browser.runtime.onMessage is a WebExtension API
        browser.runtime.onMessage.removeListener(this.handleMessageHandler);
        this.logger.info('Runtime message handler unregistered');
      } else {
        // @ts-expect-error - messenger is a global Thunderbird API
        if (typeof messenger !== 'undefined' && messenger.runtime?.onMessage) {
          // @ts-expect-error - messenger.runtime.onMessage is a Thunderbird API
          messenger.runtime.onMessage.removeListener(this.handleMessageHandler);
          this.logger.info('Runtime message handler unregistered (messenger API)');
        }
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
    this.handlerState.messagesHandled++;

    // Handle messages asynchronously
    (async () => {
      try {
        // Route message to appropriate handler
        if (isStartBatchAnalysisMessage(message)) {
          const result = await this.handleStartBatchAnalysis(message);
          sendResponse(result);
          return;
        }

        if (isGetBatchProgressMessage(message)) {
          const result = this.handleGetBatchProgress();
          sendResponse(result);
          return;
        }

        if (isCancelBatchAnalysisMessage(message)) {
          const result = await this.handleCancelBatchAnalysis();
          sendResponse(result);
          return;
        }

        if (isAnalyzeSingleMessageMessage(message)) {
          const result = await this.handleAnalyzeSingleMessage(message);
          sendResponse(result);
          return;
        }

        if (isClearQueueMessage(message)) {
          const result = this.handleClearQueue(message);
          sendResponse(result);
          return;
        }

        if (isClearCacheMessage(message)) {
          const result = await this.handleClearCache();
          sendResponse(result);
          return;
        }

        if (isGetCacheStatsMessage(message)) {
          const result = await this.handleGetCacheStats();
          sendResponse(result);
          return;
        }

        // Unknown message type
        this.logger.warn('Unknown runtime message received', { message });
        sendResponse({ success: false, message: 'Unknown message type' });
      } catch (error) {
        this.handlerState.errorsEncountered++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Internal error processing message', {
          message,
          error: errorMessage,
        });

        // Publish ProviderErrorEvent for internal errors
        this.eventBus
          .publish(
            createProviderErrorEvent('message-handler', 'unknown', errorMessage, {
              error: error instanceof Error ? error : undefined,
              errorType: 'unknown',
            })
          )
          .catch((publishError) => {
            this.logger.error('Failed to publish ProviderErrorEvent', {
              error: publishError instanceof Error ? publishError.message : String(publishError),
            });
          });

        sendResponse({ success: false, message: 'Internal error processing message' });
      }
    })();

    // Return true to indicate async response
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
      const messageIds = await this.getMessagesToAnalyze(message.folderId);

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
   * @returns Current batch progress
   */
  private handleGetBatchProgress(): BatchProgress {
    return { ...this.batchProgress };
  }

  /**
   * Handles cancel batch analysis message.
   *
   * @returns Cancel result
   */
  private async handleCancelBatchAnalysis(): Promise<{ success: boolean; message: string }> {
    this.logger.info('Handling cancelBatchAnalysis message');

    if (this.batchProgress.status !== 'running') {
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
    this.logger.info('Handling analyzeSingleMessage message', { messageId: message.messageId });

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
      this.logger.error('Failed to analyze single message', {
        messageId: message.messageId,
        error: errorMessage,
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
   * @param message - Clear queue message
   * @returns Clear queue result
   */
  private handleClearQueue(message: ClearQueueMessage): ClearQueueResult {
    this.logger.info('Handling clearQueue message', { cancelRunning: message.cancelRunning });

    // Simplified implementation - in real code, you would integrate with RateLimiter
    return {
      success: true,
      clearedTasks: 0,
      cancelledProviders: [],
      providers: {},
    };
  }

  /**
   * Handles clear cache message.
   *
   * @returns Clear cache result
   */
  private async handleClearCache(): Promise<{ success: boolean; message: string }> {
    this.logger.info('Handling clearCache message');

    // Simplified implementation - in real code, you would integrate with ICache
    return {
      success: true,
      message: 'Cache cleared successfully',
    };
  }

  /**
   * Handles get cache stats message.
   *
   * @returns Cache stats
   */
  private async handleGetCacheStats(): Promise<{
    success: boolean;
    totalEntries?: number;
    hitRate?: number;
  }> {
    this.logger.info('Handling getCacheStats message');

    // Simplified implementation - in real code, you would integrate with ICache
    return {
      success: true,
      totalEntries: 0,
      hitRate: 0,
    };
  }

  /**
   * Gets provider settings from ConfigRepository.
   *
   * @returns Provider settings
   */
  private async getProviderSettings(): Promise<IProviderSettings> {
    try {
      const appConfig = await this.configRepository.getAppConfig();
      const defaultProvider = appConfig.defaultProvider;

      const providerSettings = await this.configRepository.getProviderSettings(defaultProvider);

      return {
        provider: defaultProvider,
        apiKey: providerSettings.apiKey,
        model: providerSettings.model,
        apiUrl: providerSettings.apiUrl,
        additionalConfig: providerSettings.additionalConfig,
      };
    } catch (error) {
      this.logger.error('Failed to get provider settings', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { provider: '' };
    }
  }

  /**
   * Gets messages to analyze.
   *
   * @param folderId - Optional folder ID to filter messages
   * @returns Array of message IDs to analyze
   */
  private async getMessagesToAnalyze(folderId?: string): Promise<string[]> {
    try {
      // @ts-expect-error - messenger is a global Thunderbird API
      if (typeof messenger === 'undefined' || !messenger.messages) {
        return [];
      }

      // @ts-expect-error - messenger.messages is a Thunderbird API
      const result = await messenger.messages.list(folderId);

      if (!result.messages || result.messages.length === 0) {
        return [];
      }

      return result.messages.map((m: { id: number }) => String(m.id));
    } catch (error) {
      this.logger.error('Failed to get messages', {
        folderId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
