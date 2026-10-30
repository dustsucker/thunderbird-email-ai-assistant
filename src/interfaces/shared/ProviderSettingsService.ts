/**
 * Provider Settings Service
 *
 * Shared helper for resolving the active provider settings and listing the
 * message IDs of a folder. Extracted to replace three identical
 * `getProviderSettings()` copies (EmailEventListener, MessageHandler,
 * ContextMenuHandler) and two `getMessagesToAnalyze()` copies
 * (MessageHandler, ContextMenuHandler).
 *
 * @module interfaces/shared/ProviderSettingsService
 */

import type { ILogger } from '@/domain/interfaces';
import type { IProviderSettings } from '@/infrastructure/interfaces/IProvider';
import type { AppConfigService } from '@/infrastructure/config/AppConfig';

/**
 * Plain (non-DI) provider settings helper.
 *
 * ponytail: composed, not `@injectable` — every caller already receives
 * AppConfigService + ILogger from the container, and AppConfigService is
 * itself a singleton (its cache is shared), so a new DI token would add
 * nothing but a DIContainer registration we are not allowed to touch.
 */
export class ProviderSettingsService {
  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly logger: ILogger
  ) {}

  /**
   * Resolves the settings of the configured default provider.
   *
   * Issue #33: storage read errors propagate to the caller (whose existing
   * error handlers notify the user) instead of silently returning
   * `{ provider: '' }`, which conflated "not configured" with read failure.
   *
   * @throws Error when the config cannot be read from storage
   */
  async getProviderSettings(): Promise<IProviderSettings> {
    const appConfig = await this.appConfigService.getAppConfig();
    const defaultProvider = appConfig.defaultProvider;
    const providerSettings = await this.appConfigService.getProviderSettings(defaultProvider);

    return {
      provider: defaultProvider,
      apiKey: providerSettings.apiKey,
      model: providerSettings.model,
      apiUrl: providerSettings.apiUrl,
      additionalConfig: providerSettings.additionalConfig,
    };
  }

  /**
   * Lists all message IDs of a folder, iterating every pagination page.
   *
   * @param folderId - Folder ID (must be provided; never calls list(undefined))
   * @returns Message IDs, or an empty array when the folder is unknown/empty
   */
  async getMessagesToAnalyze(folderId?: string): Promise<string[]> {
    if (!folderId) {
      this.logger.warn('getMessagesToAnalyze called without a folderId; skipping listing');
      return [];
    }

    try {
      if (typeof messenger === 'undefined' || !messenger.messages) {
        return [];
      }

      const messageIds: string[] = [];
      let page: MessageList | null = await messenger.messages.list(folderId);

      while (page) {
        for (const message of page.messages) {
          messageIds.push(String(message.id));
        }

        page = page.id ? await messenger.messages.continueList(page.id) : null;
      }

      return messageIds;
    } catch (error) {
      this.logger.error('Failed to get messages', {
        folderId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
