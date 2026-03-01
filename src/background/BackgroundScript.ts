/**
 * Background Script Main Class
 *
 * Orchestrates all background services and handlers.
 *
 * @module background/BackgroundScript
 */

import { injectable } from 'tsyringe';
import { container } from 'tsyringe';

import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import { TagService } from '@/domain/services/TagService';
import { EmailEventListener } from '@/interfaces/background/EmailEventListener';
import { MessageHandler } from '@/interfaces/background/MessageHandler';
import { ContextMenuHandler } from './ContextMenuHandler';
import { ToolbarHandler } from './ToolbarHandler';
import { InstallHandler } from './InstallHandler';

// ============================================================================
// Background Script
// ============================================================================

/**
 * Background Script Main Class
 *
 * Orchestrates:
 * - DI Container setup
 * - Background services (EmailEventListener, MessageHandler)
 * - Context menus
 * - Toolbar buttons
 * - Install handlers
 *
 * @class BackgroundScript
 */
@injectable()
export class BackgroundScript {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private eventListener: EmailEventListener | null = null;
  private messageHandler: MessageHandler | null = null;
  private logger: ILogger | null = null;
  private isInitialized = false;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  constructor() {
    // Constructor for DI container
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Initializes the background script.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[Background Startup] Background script already initialized');
      return;
    }

    console.log('[Background Startup] Initializing background script...');

    try {
      // Step 1: Resolve logger
      this.logger = container.resolve<ILogger>('ILogger');
      this.logger.info('Background script initialization started');

      // Step 2: Ensure all custom tags exist
      this.logger?.info('Ensuring all custom tags exist in Thunderbird...');
      const tagService = container.resolve<TagService>('TagService');
      await tagService.ensureTagsExist();
      this.logger?.info('Tag initialization completed');

      // Step 3: Resolve background services
      this.eventListener = container.resolve<EmailEventListener>(EmailEventListener);
      this.messageHandler = container.resolve<MessageHandler>(MessageHandler);

      // Step 4: Start background services
      this.eventListener.start();
      this.messageHandler.start();

      // Step 5: Register context menus
      const contextMenuHandler = container.resolve<ContextMenuHandler>(ContextMenuHandler);
      contextMenuHandler.registerMenus();

      // Step 6: Register toolbar button
      const toolbarHandler = container.resolve<ToolbarHandler>(ToolbarHandler);
      toolbarHandler.register();

      // Step 7: Register install handler
      const installHandler = container.resolve<InstallHandler>(InstallHandler);
      installHandler.register();

      // Step 8: Register shutdown handler
      this.registerShutdownHandler();

      this.isInitialized = true;
      this.logger.info('Background script initialization completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Background Startup] Failed to initialize background script', error);
      throw new Error(`Background script initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Shutdowns the background script.
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('[Background Startup] Background script not initialized, nothing to shutdown');
      return;
    }

    console.log('[Background Startup] Shutting down background script...');

    try {
      if (this.eventListener) {
        this.eventListener.stop();
        this.logger?.info('EmailEventListener stopped');
      }

      if (this.messageHandler) {
        this.messageHandler.stop();
        this.logger?.info('MessageHandler stopped');
      }

      // Cleanup handlers
      const contextMenuHandler = container.resolve<ContextMenuHandler>(ContextMenuHandler);
      const installHandler = container.resolve<InstallHandler>(InstallHandler);

      contextMenuHandler.unregisterMenus();
      installHandler.unregister();

      this.isInitialized = false;
      this.logger?.info('Background script shutdown completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Background Startup] Failed to shutdown background script', error);
      throw new Error(`Background script shutdown failed: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Registers shutdown handler for extension cleanup.
   */
  private registerShutdownHandler(): void {
    this.logger?.info('Registering shutdown handler...');

    if (messenger.runtime && messenger.runtime.onSuspend) {
      messenger.runtime.onSuspend.addListener(async () => {
        this.logger?.info('Extension suspending, cleaning up...');
        await this.shutdown();
      });
    } else {
      this.logger?.warn('Runtime suspend handler not available');
    }

    this.logger?.info('Shutdown handler registered');
  }
}
