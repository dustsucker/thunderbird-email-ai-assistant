/**
 * Unit tests for ProviderSettingsService.getMessagesToAnalyze().
 *
 * Covers honest folder pagination: full pagination across pages, aborted
 * pagination (e.g. "No message list for id X" after an MV3 background
 * restart) and silent truncation (stale virtual-folder cache listing,
 * Bugzilla 2071400).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ILogger } from '@/domain/interfaces';
import type { AppConfigService } from '@/infrastructure/config/AppConfig';
import { ProviderSettingsService } from '@/interfaces/shared/ProviderSettingsService';

// ============================================================================
// Fixtures
// ============================================================================

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    maskApiKey: vi.fn(),
  };
}

/** Message page with n messages (ids 1..n) and the given continuation id. */
function pageOf(n: number, id: string | null): MessageList {
  return {
    id,
    messages: Array.from({ length: n }, (_, i) => ({ id: i + 1 })),
  };
}

describe('ProviderSettingsService.getMessagesToAnalyze', () => {
  let logger: ILogger;

  const setMessenger = (m: unknown): void => {
    (globalThis as unknown as Record<string, unknown>).messenger = m;
  };

  const createService = (): ProviderSettingsService =>
    new ProviderSettingsService({} as unknown as AppConfigService, logger);

  beforeEach(() => {
    logger = createMockLogger();
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).messenger;
  });

  it('collects message ids across ALL pages (180 mails over 2 pages)', async () => {
    const list = vi.fn().mockResolvedValue(pageOf(100, 'l1'));
    const continueList = vi.fn().mockResolvedValue(pageOf(80, null));
    const foldersGet = vi.fn().mockResolvedValue({ id: 'f1', totalMessageCount: 180 });
    setMessenger({ messages: { list, continueList }, folders: { get: foldersGet } });

    const result = await createService().getMessagesToAnalyze('folder1');

    expect(list).toHaveBeenCalledWith('folder1');
    expect(continueList).toHaveBeenCalledWith('l1');
    expect(result.messageIds).toHaveLength(180);
    expect(result.incomplete).toBe(false);
    expect(result.expectedTotal).toBe(180);
  });

  it('marks the result incomplete and warns when continueList throws', async () => {
    const list = vi.fn().mockResolvedValue(pageOf(100, 'l1'));
    const continueList = vi.fn().mockRejectedValue(new Error('No message list for id l1'));
    const foldersGet = vi.fn().mockResolvedValue({ id: 'f1', totalMessageCount: 180 });
    setMessenger({ messages: { list, continueList }, folders: { get: foldersGet } });

    const result = await createService().getMessagesToAnalyze('folder1');

    expect(result.messageIds).toHaveLength(100);
    expect(result.incomplete).toBe(true);
    expect(result.expectedTotal).toBe(180);
    expect(logger.warn).toHaveBeenCalledWith(
      'Pagination aborted early',
      expect.objectContaining({ folderId: 'folder1', collected: 100 })
    );
  });

  it('marks the result incomplete when the listing is truncated below totalMessageCount', async () => {
    const list = vi.fn().mockResolvedValue(pageOf(100, null));
    const foldersGet = vi.fn().mockResolvedValue({ id: 'f1', totalMessageCount: 180 });
    setMessenger({ messages: { list }, folders: { get: foldersGet } });

    const result = await createService().getMessagesToAnalyze('folder1');

    expect(result.messageIds).toHaveLength(100);
    expect(result.incomplete).toBe(true);
    expect(result.expectedTotal).toBe(180);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not flag incomplete when the expected total is unknown (folders.get throws)', async () => {
    const list = vi.fn().mockResolvedValue(pageOf(100, null));
    const foldersGet = vi.fn().mockRejectedValue(new Error('folder not found'));
    setMessenger({ messages: { list }, folders: { get: foldersGet } });

    const result = await createService().getMessagesToAnalyze('folder1');

    expect(result.messageIds).toHaveLength(100);
    expect(result.incomplete).toBe(false);
    expect(result.expectedTotal).toBe(-1);
  });

  it('returns an empty listing when called without a folderId', async () => {
    const result = await createService().getMessagesToAnalyze();

    expect(result.messageIds).toEqual([]);
    expect(result.incomplete).toBe(false);
    expect(result.expectedTotal).toBe(-1);
  });
});
