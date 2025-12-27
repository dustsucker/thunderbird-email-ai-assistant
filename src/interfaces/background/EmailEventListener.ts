/**
 * Email Event Listener Service
 *
 * Handles Thunderbird email events and triggers analysis workflows.
 *
 * This service:
 * - Listens for new mail received events
 * - Automatically triggers email analysis for new messages
 * - Manages event listener registration/deregistration
 * - Coordinates with mail reader and analysis use cases
 *
 * @module interfaces/background/EmailEventListener
 */

import { injectable, inject } from 'tsyringe';
import type { IMailReader } from '@/infrastructure/interfaces/IMailReader';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Folder structure from Thunderbird events.
 */
interface ThunderbirdFolder {
  /** Account identifier */
  accountId: number;
  /** Folder name */
  name: string;
  /** Folder type (inbox, sent, etc.) */
  type: string;
  /** Folder path */
  path?: string;
}

/**
 * New mail messages structure from Thunderbird events.
 */
interface ThunderbirdNewMailMessages {
  /** Array of new message metadata */
  messages: Array<{ id: number }>;
}

/**
 * Event listener state.
 */
interface ListenerState {
  /** Whether listeners are registered */
  isRegistered: boolean;
  /** Number of messages processed */
  messagesProcessed: number;
  /** Number of errors encountered */
  errorsEncountered: number;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Email Event Listener Service
 *
 * Listens for Thunderbird email events and triggers analysis.
 * Manages automatic email processing workflows.
 *
 * @example
 * ```typescript
 * const service = container.resolve<EmailEventListener>(EmailEventListener);
 *
 * // Start listening for new mail events
 * service.start();
 *
 * // Later, stop listening
 * service.stop();
 * ```
 */
@injectable()
export class EmailEventListener {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly analyzeBatch: AnalyzeBatchEmails;
  private readonly logger: ILogger;

  private listenerState: ListenerState = {
    isRegistered: false,
    messagesProcessed: 0,
    errorsEncountered: 0,
  };

  // Cached function references for proper listener removal
  private onNewMailReceivedHandler:
    | ((folder: ThunderbirdFolder, messages: ThunderbirdNewMailMessages) => Promise<void>)
    | null = null;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  /**
   * Creates a new EmailEventListener instance.
   *
   * @param _mailReader - Mail reader for accessing email messages (reserved for future use)
   * @param _analyzeEmail - Single email analysis use case (reserved for future use)
   * @param analyzeBatch - Batch email analysis use case
   * @param logger - Logger instance for logging operations
   */
  constructor(
    @inject('IMailReader') _mailReader: IMailReader,
    @inject(AnalyzeEmail) _analyzeEmail: AnalyzeEmail,
    @inject(AnalyzeBatchEmails) analyzeBatch: AnalyzeBatchEmails,
    @inject('ILogger') logger: ILogger
  ) {
    this.analyzeBatch = analyzeBatch;
    this.logger = logger;

    this.logger.debug('EmailEventListener service initialized');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Registers email event listeners.
   *
   * Sets up handlers for new mail events and other Thunderbird
   * email-related events.
   */
  registerListeners(): void {
    if (this.listenerState.isRegistered) {
      this.logger.warn('Event listeners already registered');
      return;
    }

    this.logger.info('Registering email event listeners');

    // Register new mail received handler
    this.onNewMailReceivedHandler = this.onNewMailReceived.bind(this);

    // Access global messenger object (Thunderbird WebExtension API)
    // @ts-expect-error - messenger is a global Thunderbird API
    if (typeof messenger !== 'undefined' && messenger.messages?.onNewMailReceived) {
      // @ts-expect-error - messenger.messages.onNewMailReceived is a Thunderbird API
      messenger.messages.onNewMailReceived.addListener(this.onNewMailReceivedHandler);
      this.listenerState.isRegistered = true;
      this.logger.info('New mail event listener registered');
    } else {
      this.logger.warn('Thunderbird messenger API not available');
    }
  }

  /**
   * Unregisters email event listeners.
   *
   * Removes all registered event handlers.
   */
  unregisterListeners(): void {
    if (!this.listenerState.isRegistered) {
      this.logger.debug('Event listeners not registered');
      return;
    }

    this.logger.info('Unregistering email event listeners');

    // Unregister new mail received handler
    if (this.onNewMailReceivedHandler) {
      // @ts-expect-error - messenger is a global Thunderbird API
      if (typeof messenger !== 'undefined' && messenger.messages?.onNewMailReceived) {
        // @ts-expect-error - messenger.messages.onNewMailReceived is a Thunderbird API
        messenger.messages.onNewMailReceived.removeListener(this.onNewMailReceivedHandler);
        this.logger.info('New mail event listener unregistered');
      }
      this.onNewMailReceivedHandler = null;
    }

    this.listenerState.isRegistered = false;
    this.logger.info('Email event listeners unregistered');
  }

  /**
   * Starts the event listener service.
   *
   * Registers all event listeners and begins monitoring for email events.
   */
  start(): void {
    this.logger.info('Starting email event listener service');
    this.registerListeners();
  }

  /**
   * Stops the event listener service.
   *
   * Unregisters all event listeners and stops monitoring for email events.
   */
  stop(): void {
    this.logger.info('Stopping email event listener service');
    this.unregisterListeners();
  }

  /**
   * Gets current listener state.
   *
   * @returns Current state of event listeners
   */
  getState(): ListenerState {
    return { ...this.listenerState };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Handler for new mail received events.
   *
   * Processes incoming messages through batch analysis and applies tags.
   *
   * @param folder - Folder information
   * @param messages - New mail messages
   */
  private async onNewMailReceived(
    folder: ThunderbirdFolder,
    messages: ThunderbirdNewMailMessages
  ): Promise<void> {
    this.logger.info('New mail event received', {
      messageCount: messages.messages.length,
      folderName: folder.name,
      folderPath: folder.path,
      folderType: folder.type,
    });

    try {
      // Convert message IDs to strings for use case compatibility
      const messageIds = messages.messages.map((m) => String(m.id));

      // Get provider settings from storage (simplified for this service)
      // In a real implementation, you would read from app config
      const providerSettings: IProviderSettings = await this.getProviderSettings();

      if (!providerSettings.provider) {
        this.logger.warn('No provider configured, skipping email analysis');
        return;
      }

      // Start batch analysis for new messages
      const result = await this.analyzeBatch.execute(messageIds, {
        providerSettings,
        priority: 2, // Higher priority for new mail
        concurrency: 3,
      });

      this.logger.info('New mail processing completed', {
        total: result.total,
        successCount: result.successCount,
        failureCount: result.failureCount,
      });

      // Update listener state
      this.listenerState.messagesProcessed += result.total;

      // If there were failures, log warnings
      if (result.failureCount > 0) {
        this.logger.warn('Some new mail messages failed to process', {
          failed: result.failureCount,
          failedIds: result.results
            .filter((r) => !r.success)
            .map((r) => r.messageId),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to process new mail event', {
        folderName: folder.name,
        messageCount: messages.messages.length,
        error: errorMessage,
      });

      this.listenerState.errorsEncountered++;
    }
  }

  /**
   * Gets provider settings from storage.
   *
   * Reads application configuration and returns provider settings.
   *
   * @returns Provider settings
   */
  private async getProviderSettings(): Promise<IProviderSettings> {
    try {
      // @ts-expect-error - messenger is a global Thunderbird API
      if (typeof messenger === 'undefined' || !messenger.storage) {
        return { provider: '' };
      }

      // @ts-expect-error - messenger.storage.local is a Thunderbird API
      const result = await messenger.storage.local.get({
        provider: '',
        apiKey: '',
        model: '',
      });

      return {
        provider: result.provider as string,
        apiKey: result.apiKey as string,
        model: result.model as string,
      };
    } catch (error) {
      this.logger.error('Failed to get provider settings', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { provider: '' };
    }
  }
}
