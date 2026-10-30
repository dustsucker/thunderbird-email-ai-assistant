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
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import { ConsoleLogger } from '@/infrastructure/logger/ConsoleLogger';
import type { DebugLogLevel } from '@/infrastructure/logger/DebugLogBuffer';
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

  /**
   * Startup logging through the standard logger path (gated + buffered).
   * Safe before DI resolution: ConsoleLogger instances share module-level
   * gate state and the debug buffer singleton.
   */
  private readonly startupLog = new ConsoleLogger();

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
      this.startupLog.warn('Background script already initialized');
      return;
    }

    this.startupLog.info('Initializing background script...');

    try {
      // Step 1: Resolve logger and apply the persisted enableLogging switch
      this.logger = container.resolve<ILogger>('ILogger');
      await this.applyLoggingConfig();

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

      this.isInitialized = true;
      this.logger.info('Background script initialization completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error('Failed to initialize background script', {
        error: errorMessage,
      });
      throw new Error(`Background script initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Applies the persisted logging config to the shared logger gate (issue #3):
   * `enableLogging` master switch and `logLevel` ('debug'|'info'|'warn'|'error',
   * fallback 'debug'). No stored config yet → keep defaults (enabled, debug).
   */
  private async applyLoggingConfig(): Promise<void> {
    if (!(this.logger instanceof ConsoleLogger)) return;
    try {
      const configRepository = container.resolve<IConfigRepository>('IConfigRepository');
      const appConfig = await configRepository.getAppConfig();
      const storedLevel = appConfig.logLevel;
      const level: DebugLogLevel =
        storedLevel === 'info' || storedLevel === 'warn' || storedLevel === 'error'
          ? storedLevel
          : 'debug';
      this.logger.configure({ enabled: appConfig.enableLogging, level });
    } catch {
      this.logger.configure({ enabled: true, level: 'debug' });
    }
  }

  /**
   * Shutdowns the background script.
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      this.startupLog.warn('Background script not initialized, nothing to shutdown');
      return;
    }

    this.startupLog.info('Shutting down background script...');

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
      this.logger?.error('Failed to shutdown background script', { error: errorMessage });
      throw new Error(`Background script shutdown failed: ${errorMessage}`);
    }
  }
}
