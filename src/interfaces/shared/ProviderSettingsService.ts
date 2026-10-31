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
/**
 * Result of listing a folder's message IDs for batch analysis.
 *
 * `incomplete` is honest-by-default: `true` when pagination aborted early
 * (e.g. "No message list for id X" after an MV3 background restart) or when
 * the collected count is below the folder's `totalMessageCount` (stale
 * virtual-folder cache listing, Bugzilla 2071400).
 */
export interface FolderMessageListing {
  /** Collected message IDs (best effort). */
  messageIds: string[];
  /** True when the listing is known to be truncated. */
  incomplete: boolean;
  /** Folder's totalMessageCount from messenger.folders.get(); -1 when unknown. */
  expectedTotal: number;
}

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
   * Honest about truncation: returns `incomplete: true` instead of silently
   * passing a partial list off as the whole folder (previous behavior
   * reported "100/100" for a 180-mail folder when pagination died).
   *
   * @param folderId - Folder ID (must be provided; never calls list(undefined))
   * @returns Listing with message IDs, or an empty listing when the folder is unknown/empty
   */
  async getMessagesToAnalyze(folderId?: string): Promise<FolderMessageListing> {
    if (!folderId) {
      this.logger.warn('getMessagesToAnalyze called without a folderId; skipping listing');
      return { messageIds: [], incomplete: false, expectedTotal: -1 };
    }

    if (typeof messenger === 'undefined' || !messenger.messages) {
      return { messageIds: [], incomplete: false, expectedTotal: -1 };
    }

    const expectedTotal = await this.getExpectedTotal(folderId);
    const messageIds: string[] = [];
    let incomplete = false;

    try {
      let page: MessageList | null = await messenger.messages.list(folderId);

      while (page) {
        for (const message of page.messages) {
          messageIds.push(String(message.id));
        }

        if (!page.id) break;

        try {
          page = await messenger.messages.continueList(page.id);
        } catch (error) {
          // Pagination dead (e.g. MV3 background restart): report partial, never fake full
          incomplete = true;
          this.logger.warn('Pagination aborted early', {
            folderId,
            collected: messageIds.length,
            error: error instanceof Error ? error.message : String(error),
          });
          break;
        }
      }
    } catch (error) {
      // list() itself failed: no partial data, callers treat this as "nothing to analyze"
      this.logger.error('Failed to get messages', {
        folderId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { messageIds: [], incomplete: false, expectedTotal };
    }

    if (!incomplete && expectedTotal >= 0 && messageIds.length < expectedTotal) {
      // Silent truncation without a throw (stale virtual-folder cache)
      incomplete = true;
      this.logger.warn('Folder listing truncated below expected total', {
        folderId,
        collected: messageIds.length,
        expectedTotal,
      });
    }

    return { messageIds, incomplete, expectedTotal };
  }

  /**
   * Reads the folder's total message count; -1 when unavailable (older TB
   * versions without messenger.folders, unknown folder, or API error).
   */
  private async getExpectedTotal(folderId: string): Promise<number> {
    try {
      const folders = (
        messenger as {
          folders?: { get(folderId: string): Promise<{ totalMessageCount?: number }> };
        }
      ).folders;
      if (!folders?.get) return -1;
      const folder = await folders.get(folderId);
      return typeof folder?.totalMessageCount === 'number' ? folder.totalMessageCount : -1;
    } catch {
      return -1;
    }
  }
}
