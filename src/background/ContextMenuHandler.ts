/**
 * Context Menu Handler
 *
 * Handles Thunderbird context menu creation and click handling.
 *
 * @module background/ContextMenuHandler
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import { AppConfigService } from '@/infrastructure/config/AppConfig';

// ============================================================================
// Thunderbird API Types (inline declarations)
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
  selectedMessages?: {
    id: number | null;
    messages: Array<{ id: number; date: string }>;
  };
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
// Context Menu Handler
// ============================================================================

/**
 * Handles Thunderbird context menus for email analysis.
 *
 * Provides:
 * - Folder context menu for batch analysis
 * - Message list context menu for single message analysis
 * - Message display context menu for single message analysis
 *
 * @example
 * ```typescript
 * const handler = container.resolve<ContextMenuHandler>(ContextMenuHandler);
 * handler.registerMenus();
 * ```
 */
@injectable()
export class ContextMenuHandler {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly analyzeEmail: AnalyzeEmail;
  private readonly analyzeBatch: AnalyzeBatchEmails;
  private readonly appConfigService: AppConfigService;
  private readonly logger: ILogger;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  /**
   * Creates a new ContextMenuHandler instance.
   *
   * @param analyzeEmail - Single email analysis use case
   * @param analyzeBatch - Batch email analysis use case
   * @param appConfigService - App config service for loading provider settings
   * @param logger - Logger instance for logging operations
   */
  constructor(
    @inject(AnalyzeEmail) analyzeEmail: AnalyzeEmail,
    @inject(AnalyzeBatchEmails) analyzeBatch: AnalyzeBatchEmails,
    @inject(AppConfigService) appConfigService: AppConfigService,
    @inject('ILogger') logger: ILogger
  ) {
    this.analyzeEmail = analyzeEmail;
    this.analyzeBatch = analyzeBatch;
    this.appConfigService = appConfigService;
    this.logger = logger;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Registers all context menus.
   */
  registerMenus(): void {
    this.logger.info('Registering context menus...');

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
          if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.lastError) {
            this.logger.error('Failed to create folder context menu', browser.runtime.lastError);
          } else {
            this.logger.info('Folder context menu registered');
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
          if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.lastError) {
            this.logger.error(
              'Failed to create message list context menu',
              browser.runtime.lastError
            );
          } else {
            this.logger.info('Message list context menu registered');
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
          if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.lastError) {
            this.logger.error(
              'Failed to create message display context menu',
              browser.runtime.lastError
            );
          } else {
            this.logger.info('Message display context menu registered');
          }
        }
      );

      // Register context menu click handler
      messenger.menus.onClicked.addListener(this.handleMenuClick.bind(this));

      this.logger.info('All context menus registered successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to register context menus', { error: errorMessage });
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Handles context menu clicks.
   */
  private async handleMenuClick(info: FolderMenuOnClickData, _tab: Tab): Promise<void> {
    // Extract message data for proper access to messages array
    const messageData = info.selectedMessages;

    // Detailed debug logging before any conditions
    this.logger.info('Context menu clicked', {
      menuItemId: info.menuItemId,
      menuItemIdType: typeof info.menuItemId,
      hasSelectedMessages: messageData !== undefined,
      hasMessagesProperty: messageData?.messages !== undefined,
      messageCount: messageData?.messages?.length ?? 0,
      hasSelectedFolders: info.selectedFolders !== undefined,
      folderCount: info.selectedFolders?.length ?? 0,
    });

    try {
      if (typeof info.menuItemId !== 'string') {
        this.logger.warn('Invalid menuItemId type', { menuItemId: info.menuItemId });
        return;
      }

      const menuItemId = info.menuItemId;

      // Handle folder batch analysis
      if (menuItemId === 'batch-analyze-folder') {
        await this.handleFolderBatchAnalysis(info);
        return;
      }

      // Handle single message analysis
      if (
        menuItemId === 'analyze-single-message-list' ||
        menuItemId === 'analyze-single-message-display'
      ) {
        await this.handleSingleMessageAnalysis(info);
        return;
      }

      this.logger.warn('Unknown context menu item', {
        menuItemId,
        hasSelectedMessages: messageData !== undefined,
        hasSelectedFolders: info.selectedFolders !== undefined,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('[DEBUG-background] Failed to handle context menu click', {
        error: errorMessage,
        stack: errorStack,
      });
    }
  }

  /**
   * Handles folder batch analysis.
   */
  private async handleFolderBatchAnalysis(info: FolderMenuOnClickData): Promise<void> {
    if (!info.selectedFolders) {
      this.logger.warn('Folder batch analysis requested but no folders selected', {
        menuItemId: info.menuItemId,
      });
      return;
    }

    const folders = info.selectedFolders;
    if (folders.length === 0) {
      this.logger.warn('Folder batch analysis requested but folder list is empty', {
        menuItemId: info.menuItemId,
        folderCount: 0,
      });
      return;
    }

    const folder = folders[0];
    this.logger.info('Starting batch analysis for folder', {
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

    try {
      this.logger.info('Batch Step 1: Getting provider settings...');
      const providerSettings = await this.getProviderSettings();

      this.logger.info('Batch Step 2: Provider settings retrieved', {
        provider: providerSettings.provider,
        hasApiKey: !!providerSettings.apiKey,
      });

      if (!providerSettings.provider) {
        await messenger.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Fehler',
          message: 'Kein Provider konfiguriert. Bitte überprüfen Sie Ihre Einstellungen.',
        });
        return;
      }

      // Get messages to analyze
      const messageIds = await this.getMessagesToAnalyze(folder.id);

      if (messageIds.length === 0) {
        await messenger.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Keine Nachrichten',
          message: `Keine Nachrichten in Ordner "${folder.name}" gefunden.`,
        });
        return;
      }

      this.logger.info('Batch Step 3: Starting batch analysis', {
        messageCount: messageIds.length,
      });

      // Direct use case call
      const result = await this.analyzeBatch.execute(messageIds, {
        providerSettings,
        priority: 1,
        concurrency: 3,
      });

      this.logger.info('Batch analysis completed successfully', {
        total: result.total,
        successful: result.successCount,
        failed: result.failureCount,
      });

      await messenger.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Batch-Analysis abgeschlossen',
        message: `Analyzed ${result.successCount}/${result.total} messages successfully.`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Failed to execute batch analysis', {
        error: errorMessage,
        stack: errorStack,
      });
      await messenger.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Fehler',
        message: `Batch-Analyse fehlgeschlagen: ${errorMessage}`,
      });
    }
  }

  /**
   * Handles single message analysis.
   */
  private async handleSingleMessageAnalysis(info: FolderMenuOnClickData): Promise<void> {
    const messageData = info.selectedMessages;

    if (!messageData) {
      this.logger.warn('Single message analysis requested but no messages selected', {
        menuItemId: info.menuItemId,
      });
      return;
    }

    const messages = messageData.messages || [];
    if (messages.length === 0) {
      this.logger.warn('Single message analysis requested but message list is empty', {
        menuItemId: info.menuItemId,
        messageCount: 0,
      });
      return;
    }

    const messageId = messages[0].id;
    this.logger.info('Starting single message analysis', { messageId });

    // Show notification
    await messenger.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Analyse gestartet',
      message: `Analyse für Nachricht ${messageId} gestartet`,
    });

    try {
      this.logger.info('Step 1: Getting provider settings...');
      const providerSettings = await this.getProviderSettings();

      this.logger.info('Step 2: Provider settings retrieved', {
        provider: providerSettings.provider,
        hasApiKey: !!providerSettings.apiKey,
      });

      if (!providerSettings.provider) {
        await messenger.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Fehler',
          message: 'Kein Provider konfiguriert. Bitte überprüfen Sie Ihre Einstellungen.',
        });
        return;
      }

      this.logger.info('Step 3: Calling analyzeEmail.execute()...');
      const result = await this.analyzeEmail.execute(String(messageId), providerSettings);

      this.logger.info('Single message analysis completed successfully', {
        messageId,
        tags: result.tags,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Failed to analyze single message', {
        messageId,
        error: errorMessage,
        stack: errorStack,
      });
      await messenger.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Fehler',
        message: `Analyse fehlgeschlagen: ${errorMessage}`,
      });
    }
  }

  /**
   * Gets provider settings from app config.
   *
   * @returns Provider settings
   */
  private async getProviderSettings(): Promise<IProviderSettings> {
    try {
      this.logger.info('Attempting to get app config...');
      const appConfig = await this.appConfigService.getAppConfig();
      const defaultProvider = appConfig.defaultProvider;

      this.logger.info('App config retrieved', { defaultProvider });

      this.logger.info(`Attempting to get provider settings for: ${defaultProvider}`);
      const providerSettings = await this.appConfigService.getProviderSettings(defaultProvider);

      this.logger.info('Provider settings retrieved', {
        apiKey: providerSettings.apiKey ? '***' : 'missing',
      });

      return {
        provider: defaultProvider,
        apiKey: providerSettings.apiKey,
        model: providerSettings.model,
        apiUrl: providerSettings.apiUrl,
        additionalConfig: providerSettings.additionalConfig,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Failed to get provider settings', {
        error: errorMessage,
        stack: errorStack,
      });
      this.logger.error('Returning empty provider settings - THIS WILL CAUSE ANALYSIS TO FAIL');
      return { provider: '' };
    }
  }

  /**
   * Gets messages to analyze from folder.
   *
   * @param folderId - Folder ID
   * @returns Array of message IDs
   */
  private async getMessagesToAnalyze(folderId: string): Promise<string[]> {
    try {
      const messages = await messenger.messages.list(folderId);
      return messages.messages.map((message: { id: number }) => String(message.id));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get messages from folder', { folderId, error: errorMessage });
      return [];
    }
  }
}
