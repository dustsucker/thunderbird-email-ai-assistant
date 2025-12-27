/**
 * Thunderbird Email AI Assistant - Background Script
 *
 * Thin delegator that sets up Dependency Injection and delegates to
 * EmailEventListener and MessageHandler services.
 *
 * @module background
 */

import 'reflect-metadata';
import { container, injectable } from 'tsyringe';

// ============================================================================
// Core Interfaces
// ============================================================================

import type { ILogger } from './src/infrastructure/interfaces/ILogger';
import type { ICache } from './src/infrastructure/interfaces/ICache';
import type { IQueue } from './src/infrastructure/interfaces/IQueue';
import type { IMailReader } from './src/infrastructure/interfaces/IMailReader';
import type { ITagManager } from './src/infrastructure/interfaces/ITagManager';

// ============================================================================
// Core Implementations
// ============================================================================

import { ConsoleLogger } from './src/infrastructure/logger/ConsoleLogger';
import { MemoryCache } from './src/infrastructure/cache/MemoryCache';
import { PriorityQueue } from './src/application/services/PriorityQueue';
import { ThunderbirdMailReader } from './src/interfaces/adapters/ThunderbirdMailReader';
import { ThunderbirdTagManager } from './src/interfaces/adapters/ThunderbirdTagManager';

// ============================================================================
// Services
// ============================================================================

import { EmailContentExtractor } from './src/domain/services/EmailContentExtractor';
import { TagService } from './src/domain/services/TagService';
import { AppConfigService } from './src/infrastructure/config/AppConfig';
import { RateLimiterService } from './src/application/services/RateLimiterService';
import { ProviderFactory } from './src/infrastructure/providers/ProviderFactory';

// ============================================================================
// Use Cases
// ============================================================================

import { AnalyzeEmail } from './src/application/use-cases/AnalyzeEmail';
import { ApplyTagsToEmail } from './src/application/use-cases/ApplyTagsToEmail';
import { AnalyzeBatchEmails } from './src/application/use-cases/AnalyzeBatchEmails';

// ============================================================================
// Background Services
// ============================================================================

import { EmailEventListener } from './src/interfaces/background/EmailEventListener';
import { MessageHandler } from './src/interfaces/background/MessageHandler';

// ============================================================================
// Types for Context Menu (Thunderbird API)
// ============================================================================

/**
 * Thunderbird folder structure for context menus.
 */
interface ThunderbirdFolder {
  accountId: string;
  id: string;
  path: string;
  name: string;
  type: string;
}

/**
 * Folder menu click data.
 */
interface FolderMenuOnClickData {
  menuItemId: string | number;
  selectedFolders?: ThunderbirdFolder[];
  modifiers: string[];
  selectedMessages?: Array<{ id: number }>;
}

/**
 * Tab interface for browser tabs.
 */
interface Tab {
  id: number;
  type: string;
  index?: number;
  windowId?: number;
  selected?: boolean;
}

// ============================================================================
// Global Declarations (Thunderbird API)
// ============================================================================

declare const messenger: {
  messages: {
    onNewMailReceived: {
      addListener(callback: (folder: ThunderbirdFolder, messages: { messages: Array<{ id: number }> }) => void): void;
    };
    getFull(messageId: number): Promise<unknown>;
    list(folderId?: string): Promise<{ messages: Array<{ id: number }> }>;
    get(messageId: number): Promise<{ id: number; tags?: string[] }>;
    update(messageId: number, properties: { tags: string[] }): Promise<void>;
  };
  messageDisplay: {
    getDisplayedMessage(tabId?: number): Promise<{ id: number } | null>;
  };
  storage: {
    local: {
      get(keys?: Record<string, unknown> | string[] | string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  runtime: {
    onSuspend: {
      addListener(callback: () => void): void;
    };
  };
  menus: {
    create(createProperties: Record<string, unknown>, callback?: () => void): void;
    onClicked: {
      addListener(callback: (info: FolderMenuOnClickData, tab: Tab) => void): void;
    };
  };
  browserAction?: {
    onClicked?: {
      addListener(callback: (tab: Tab) => void): void;
    };
  };
  action?: {
    onClicked?: {
      addListener(callback: (tab: Tab) => void): void;
    };
  };
  notifications: {
    create(options: { type: string; iconUrl: string; title: string; message: string }): Promise<string>;
  };
};

declare const browser: {
  runtime?: {
    lastError?: { message: string };
  };
};

// ============================================================================
// Logger Wrapper (for startup before DI container)
// ============================================================================

/**
 * Simple console logger for startup before DI container is ready.
 */
const startupLogger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(`[Background Startup] ${message}`, meta || '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[Background Startup] ${message}`, meta || '');
  },
  error: (message: string, error?: unknown) => {
    console.error(`[Background Startup] ${message}`, error || '');
  },
};

// ============================================================================
// Background Script Main Class
// ============================================================================

/**
 * Background Script Main Class
 *
 * @class BackgroundScript
 */
@injectable()
class BackgroundScript {
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
    startupLogger.info('BackgroundScript class instantiated');
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Initializes the background script.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      startupLogger.warn('Background script already initialized');
      return;
    }

    startupLogger.info('Initializing background script...');

    try {
      // Step 1: Setup DI container
      this.setupDIContainer();

      // Step 2: Resolve logger
      this.logger = container.resolve<ILogger>('ILogger');
      this.logger.info('Background script initialization started');

      // Step 3: Resolve background services
      this.eventListener = container.resolve<EmailEventListener>(EmailEventListener);
      this.messageHandler = container.resolve<MessageHandler>(MessageHandler);

      // Step 4: Start background services
      this.eventListener.start();
      this.messageHandler.start();

      // Step 5: Register context menus
      this.registerContextMenus();

      // Step 6: Register toolbar button
      this.registerToolbarButton();

      // Step 7: Register shutdown handler
      this.registerShutdownHandler();

      this.isInitialized = true;
      this.logger.info('Background script initialization completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      startupLogger.error('Failed to initialize background script', error);
      throw new Error(`Background script initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Shutdowns the background script.
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      startupLogger.warn('Background script not initialized, nothing to shutdown');
      return;
    }

    startupLogger.info('Shutting down background script...');

    try {
      if (this.eventListener) {
        this.eventListener.stop();
        this.logger?.info('EmailEventListener stopped');
      }

      if (this.messageHandler) {
        this.messageHandler.stop();
        this.logger?.info('MessageHandler stopped');
      }

      this.isInitialized = false;
      this.logger?.info('Background script shutdown completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      startupLogger.error('Failed to shutdown background script', error);
      throw new Error(`Background script shutdown failed: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // Private Methods - DI Container Setup
  // ==========================================================================

  /**
   * Sets up TSyringe DI container.
   */
  private setupDIContainer(): void {
    startupLogger.info('Setting up DI container...');

    // ------------------------------------------------------------------------
    // Register Core Interfaces
    // ------------------------------------------------------------------------

    container.registerSingleton<ILogger>('ILogger', ConsoleLogger);
    container.registerSingleton<ICache>('ICache', MemoryCache);
    container.registerSingleton<IQueue>('IQueue', PriorityQueue);
    container.registerSingleton<IMailReader>('IMailReader', ThunderbirdMailReader);
    container.registerSingleton<ITagManager>('ITagManager', ThunderbirdTagManager);

    startupLogger.info('Core interfaces registered');

    // ------------------------------------------------------------------------
    // Register Services
    // ------------------------------------------------------------------------

    container.registerSingleton('ProviderFactory', ProviderFactory);
    container.registerSingleton('EmailContentExtractor', EmailContentExtractor);
    container.registerSingleton('TagService', TagService);
    container.registerSingleton('AppConfigService', AppConfigService);
    container.registerSingleton('RateLimiterService', RateLimiterService);

    startupLogger.info('Services registered');

    // ------------------------------------------------------------------------
    // Register Use Cases
    // ------------------------------------------------------------------------

    container.registerSingleton('AnalyzeEmail', AnalyzeEmail);
    container.registerSingleton('ApplyTagsToEmail', ApplyTagsToEmail);
    container.registerSingleton('AnalyzeBatchEmails', AnalyzeBatchEmails);

    startupLogger.info('Use cases registered');

    // ------------------------------------------------------------------------
    // Register Background Services
    // ------------------------------------------------------------------------

    container.registerSingleton('EmailEventListener', EmailEventListener);
    container.registerSingleton('MessageHandler', MessageHandler);

    startupLogger.info('Background services registered');
    startupLogger.info('DI container setup completed');
  }

  // ==========================================================================
  // Private Methods - Context Menus
  // ==========================================================================

  /**
   * Registers Thunderbird context menus.
   */
  private registerContextMenus(): void {
    this.logger?.info('Registering context menus...');

    try {
      // Folder context menu: "Analysiere diesen Ordner"
      messenger.menus.create(
        {
          id: 'batch-analyze-folder',
          title: 'Analysiere diesen Ordner',
          contexts: ['folder_pane'],
          visible: true,
        },
        () => {
          if (browser.runtime && browser.runtime.lastError) {
            this.logger?.error('Failed to create folder context menu', browser.runtime.lastError);
          } else {
            this.logger?.info('Folder context menu registered');
          }
        }
      );

      // Message list context menu: "AI-Analyse"
      messenger.menus.create(
        {
          id: 'analyze-single-message-list',
          title: 'AI-Analyse',
          contexts: ['message_list'],
          visible: true,
        },
        () => {
          if (browser.runtime && browser.runtime.lastError) {
            this.logger?.error('Failed to create message list context menu', browser.runtime.lastError);
          } else {
            this.logger?.info('Message list context menu registered');
          }
        }
      );

      // Message display context menu: "AI-Analyse"
      messenger.menus.create(
        {
          id: 'analyze-single-message-display',
          title: 'AI-Analyse',
          contexts: ['message_display_action_menu'],
          visible: true,
        },
        () => {
          if (browser.runtime && browser.runtime.lastError) {
            this.logger?.error('Failed to create message display context menu', browser.runtime.lastError);
          } else {
            this.logger?.info('Message display context menu registered');
          }
        }
      );

      // Register context menu click handler
      messenger.menus.onClicked.addListener(this.handleContextMenuClick.bind(this));

      this.logger?.info('All context menus registered successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error('Failed to register context menus', errorMessage);
    }
  }

  /**
   * Handles context menu clicks.
   */
  private async handleContextMenuClick(info: FolderMenuOnClickData, _tab: Tab): Promise<void> {
    this.logger?.info('Context menu clicked', {
      menuItemId: info.menuItemId,
    });

    try {
      if (typeof info.menuItemId !== 'string') {
        this.logger?.warn('Invalid menuItemId type', { menuItemId: info.menuItemId });
        return;
      }

      const menuItemId = info.menuItemId as string;

      // Handle folder batch analysis
      if (menuItemId === 'batch-analyze-folder' && info.selectedFolders) {
        const folders = info.selectedFolders;
        if (folders.length > 0) {
          const folder = folders[0];
          this.logger?.info('Starting batch analysis for folder', {
            folderId: folder.id,
            folderName: folder.name,
          });

          // Show notification
          await messenger.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Batch-Analysis gestartet',
            message: `Batch-Analysis für Ordner "${folder.name}" gestartet`,
          });
        }
        return;
      }

      // Handle single message analysis
      if (
        (menuItemId === 'analyze-single-message-list' ||
          menuItemId === 'analyze-single-message-display') &&
        info.selectedMessages
      ) {
        const messages = info.selectedMessages;
        if (messages.length > 0) {
          const messageId = messages[0].id;
          this.logger?.info('Starting single message analysis', { messageId });

          // Show notification
          await messenger.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Analyse gestartet',
            message: `Analyse für Nachricht ${messageId} gestartet`,
          });
        }
        return;
      }

      this.logger?.warn('Unknown context menu item', { menuItemId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error('Failed to handle context menu click', errorMessage);
    }
  }

  // ==========================================================================
  // Private Methods - Toolbar Button
  // ==========================================================================

  /**
   * Registers toolbar button click handler.
   */
  private registerToolbarButton(): void {
    this.logger?.info('Registering toolbar button...');

    const browserAction = messenger.browserAction || messenger.action;

    if (browserAction && browserAction.onClicked) {
      browserAction.onClicked.addListener(async (tab: Tab) => {
        this.logger?.info('Toolbar button clicked', { tabId: tab.id });

        try {
          const displayedMessage = await messenger.messageDisplay.getDisplayedMessage(tab.id);

          if (!displayedMessage) {
            await messenger.notifications.create({
              type: 'basic',
              iconUrl: 'icon.png',
              title: 'Keine Nachricht',
              message: 'Keine Nachricht in diesem Tab angezeigt',
            });
            return;
          }

          const messageId = displayedMessage.id;
          this.logger?.info('Toolbar button: Starting single message analysis', { messageId });

          await messenger.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Analyse gestartet',
            message: `Analyse für Nachricht ${messageId} gestartet`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger?.error('Failed to handle toolbar button click', errorMessage);
        }
      });

      this.logger?.info('Toolbar button registered successfully');
    } else {
      this.logger?.warn('Browser action API not available for toolbar button');
    }
  }

  // ==========================================================================
  // Private Methods - Shutdown Handler
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

// ============================================================================
// Extension Entry Point
// ============================================================================

/**
 * Main extension entry point.
 */
(async function main(): Promise<void> {
  startupLogger.info('Thunderbird Email AI Assistant - Background Script Loading');

  try {
    const backgroundScript = new BackgroundScript();
    await backgroundScript.initialize();

    startupLogger.info('Thunderbird Email AI Assistant - Ready');
  } catch (error) {
    startupLogger.error('Failed to start extension', error);

    try {
      if (typeof messenger !== 'undefined' && messenger.notifications) {
        await messenger.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Fehler beim Starten',
          message: 'Die Erweiterung konnte nicht gestartet werden. Bitte überprüfen Sie die Konsole.',
        });
      }
    } catch {
      // Ignore notification errors during startup
    }

    throw error;
  }
})();

// ============================================================================
// Export for Testing
// ============================================================================

export { BackgroundScript };
