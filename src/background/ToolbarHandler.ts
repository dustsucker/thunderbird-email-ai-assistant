/**
 * Toolbar Handler
 *
 * Handles Thunderbird toolbar button clicks.
 *
 * @module background/ToolbarHandler
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type {
  BatchProgress,
  BatchProgressListener,
} from '@/application/use-cases/AnalyzeBatchEmails';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { AppConfigService } from '@/infrastructure/config/AppConfig';
import { ProviderSettingsService } from '@/interfaces/shared/ProviderSettingsService';
import {
  mapAnalysisErrorToUserMessage,
  formatTagResultMessage,
} from '@/shared/utils/errorMessages';

// ============================================================================
// Thunderbird API Types (inline declarations)
// ============================================================================

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
// Toolbar Handler
// ============================================================================

/**
 * Handles Thunderbird toolbar button interactions.
 *
 * @example
 * ```typescript
 * const handler = container.resolve<ToolbarHandler>(ToolbarHandler);
 * handler.register();
 * ```
 */
@injectable()
export class ToolbarHandler implements BatchProgressListener {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly logger: ILogger;
  private readonly analyzeEmail: AnalyzeEmail;
  private readonly providerSettingsService: ProviderSettingsService;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  /**
   * Creates a new ToolbarHandler instance.
   *
   * @param logger - Logger instance for logging operations
   * @param analyzeEmail - Single email analysis use case
   * @param appConfigService - App config service for resolving provider settings
   */
  constructor(
    @inject('ILogger') logger: ILogger,
    @inject(AnalyzeEmail) analyzeEmail: AnalyzeEmail,
    @inject(AppConfigService) appConfigService: AppConfigService
  ) {
    this.logger = logger;
    this.analyzeEmail = analyzeEmail;
    this.providerSettingsService = new ProviderSettingsService(appConfigService, logger);
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Registers toolbar button click handler.
   */
  register(): void {
    this.logger.info('Registering toolbar button...');

    const browserAction = messenger.browserAction || messenger.action;

    if (browserAction && browserAction.onClicked) {
      browserAction.onClicked.addListener(this.handleToolbarClick.bind(this));
      this.logger.info('Toolbar button registered successfully');
    } else {
      this.logger.warn('Browser action API not available for toolbar button');
    }
  }

  /**
   * Updates the toolbar badge from batch progress.
   *
   * Shows the remaining count (total - processed - failed) while the batch
   * runs; clears the badge on completion, cancellation, or error state.
   *
   * @param progress - Live batch progress
   */
  onBatchProgress(progress: BatchProgress): void {
    const remaining = progress.total - progress.processed - progress.failed;
    const done = !progress.isRunning;

    if (done || remaining <= 0) {
      this.setBadgeText('');
    } else {
      this.setBadgeText(String(remaining));
    }
  }

  /**
   * Clears the toolbar badge.
   */
  clearBadge(): void {
    this.setBadgeText('');
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Sets the toolbar badge text via the browserAction||action fallback.
   */
  private setBadgeText(text: string): void {
    const browserAction = messenger.browserAction || messenger.action;

    const withBadge = browserAction as unknown as
      | {
          setBadgeText?: (details: { text: string; tabId?: number }) => Promise<void>;
        }
      | undefined;

    if (typeof withBadge?.setBadgeText === 'function') {
      void withBadge.setBadgeText({ text }).catch((error) => {
        this.logger.warn('Failed to set toolbar badge text', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  /**
   * Reads the enableNotifications flag from storage.local (default: true).
   */
  private async isNotificationsEnabled(): Promise<boolean> {
    try {
      const data = await messenger.storage.local.get({
        appConfig: { enableNotifications: true },
      });
      const appConfig = data.appConfig as { enableNotifications?: boolean } | undefined;
      return appConfig?.enableNotifications !== false;
    } catch (error) {
      this.logger.debug('Could not read enableNotifications flag, defaulting to enabled', {
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

  /**
   * Shows a notification unless the user disabled notifications.
   */
  private async notify(title: string, message: string): Promise<void> {
    if (!(await this.isNotificationsEnabled())) {
      return;
    }
    await messenger.notifications.create({ type: 'basic', iconUrl: 'icon.png', title, message });
  }

  /**
   * Handles toolbar button click.
   */
  private async handleToolbarClick(tab: Tab): Promise<void> {
    this.logger.info('Toolbar button clicked', { tabId: tab.id });

    try {
      // ponytail: getDisplayedMessages (plural) is the only valid API since TB 128
      const displayedMessages = await messenger.messageDisplay.getDisplayedMessages(tab.id);
      const displayedMessage = displayedMessages[0];

      if (!displayedMessage) {
        await this.notify('Keine Nachricht', 'Keine Nachricht in diesem Tab angezeigt');
        return;
      }

      const messageId = displayedMessage.id;
      this.logger.info('Toolbar button: Starting single message analysis', { messageId });

      await this.notify('Analyse gestartet', 'Die Analyse wurde gestartet.');

      const providerSettings = await this.providerSettingsService.getProviderSettings();

      if (!providerSettings.provider) {
        await this.notify(
          'Fehler',
          'Kein Provider konfiguriert. Bitte überprüfen Sie Ihre Einstellungen.'
        );
        return;
      }

      const result = await this.analyzeEmail.execute(String(messageId), providerSettings);
      this.logger.info('Single message analysis completed successfully', {
        messageId,
        tags: result.tags,
      });
      await this.notify(
        'Analyse abgeschlossen',
        formatTagResultMessage(result.tags, result.confidence)
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug('Failed to handle toolbar button click', { error: errorMessage });

      await this.notify('Fehler', mapAnalysisErrorToUserMessage(errorMessage));
    }
  }
}
