/**
 * Toolbar Handler
 *
 * Handles Thunderbird toolbar button clicks.
 *
 * @module background/ToolbarHandler
 */

import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';

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
export class ToolbarHandler {
  // ==========================================================================
  // Private Fields
  // ==========================================================================

  private readonly logger: ILogger;

  // ==========================================================================
  // Constructor
  // ==========================================================================

  /**
   * Creates a new ToolbarHandler instance.
   *
   * @param logger - Logger instance for logging operations
   */
  constructor(@inject('ILogger') logger: ILogger) {
    this.logger = logger;
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

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Handles toolbar button click.
   */
  private async handleToolbarClick(tab: Tab): Promise<void> {
    this.logger.info('Toolbar button clicked', { tabId: tab.id });

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
      this.logger.info('Toolbar button: Starting single message analysis', { messageId });

      await messenger.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Analyse gestartet',
        message: `Analyse für Nachricht ${messageId} gestartet`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to handle toolbar button click', { error: errorMessage });
    }
  }
}
