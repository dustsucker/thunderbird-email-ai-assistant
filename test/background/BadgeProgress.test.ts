/**
 * Unit tests for the toolbar badge (DW-D6 / DBG3).
 *
 * Uses the REAL ToolbarHandler registered as 'BatchProgressListener' and a
 * mocked messenger action/browserAction API, so the actual badge formula and
 * the setBadgeText fallback path are executed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import type { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import type { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';
import type { IConfigRepository } from '@/infrastructure/interfaces/IConfigRepository';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import { PriorityQueue } from '@/application/services/PriorityQueue';
import { ToolbarHandler } from '@/background/ToolbarHandler';
import { container } from 'tsyringe';

describe('DW-D6: toolbar badge during batch run', () => {
  let setBadgeText: ReturnType<typeof vi.fn>;
  let analyzeBatch: AnalyzeBatchEmails;
  let toolbarHandler: ToolbarHandler;

  beforeEach(() => {
    container.reset();

    const logger: ILogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      maskApiKey: vi.fn(),
    };

    // Mock the messenger action API (browserAction absent → fallback to action)
    setBadgeText = vi.fn(async () => undefined);
    (globalThis as unknown as Record<string, unknown>).messenger = {
      action: {
        setBadgeText,
        onClicked: { addListener: vi.fn() },
      },
    };

    // The REAL ToolbarHandler, registered as the progress listener
    toolbarHandler = new ToolbarHandler(logger);
    container.registerInstance('BatchProgressListener', toolbarHandler);

    // Real PriorityQueue so dequeue/complete behave honestly
    const queue: IQueue = new PriorityQueue();

    const configRepository = {
      getAppConfig: vi.fn().mockResolvedValue({}),
      getProviderSettings: vi.fn().mockResolvedValue({}),
    } as unknown as IConfigRepository;

    const tracker = {
      wasAnalyzed: vi.fn().mockResolvedValue(false),
      markAnalyzed: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailAnalysisTracker;

    const analyzeEmail = {
      execute: vi.fn().mockImplementation(async (messageId: string) => {
        if (messageId === '2') throw new Error('provider error');
        return { tags: ['work'], confidence: 0.9, reasoning: 'ok' };
      }),
    } as unknown as AnalyzeEmail;

    analyzeBatch = new AnalyzeBatchEmails(analyzeEmail, queue, logger, configRepository, tracker);
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).messenger;
  });

  it('real ToolbarHandler badge shows 3,2,1 then clears during a 3-message run', async () => {
    await analyzeBatch.execute(['1', '3', '4'], {
      providerSettings: { provider: 'test', apiKey: 'k' },
      concurrency: 1,
    });

    const texts = setBadgeText.mock.calls.map((call) => (call[0] as { text: string }).text);

    // Start + per-item updates: 3 → 2 → 1, remaining-0 and completion clear to ''
    expect(texts).toEqual(['3', '2', '1', '', '']);
  });

  it('real ToolbarHandler clears the badge on the error path', async () => {
    await analyzeBatch.execute(['2'], {
      providerSettings: { provider: 'test', apiKey: 'k' },
      concurrency: 1,
    });

    const texts = setBadgeText.mock.calls.map((call) => (call[0] as { text: string }).text);
    // item failed (remaining 0 → ''), completion notification clears again
    expect(texts[texts.length - 1]).toBe('');
  });

  it('uses the browserAction||action fallback (no browserAction → action API)', () => {
    // The mocked messenger only exposes `action`; badge calls went through it
    toolbarHandler.onBatchProgress({
      total: 5,
      processed: 1,
      failed: 0,
      percentage: 20,
      isRunning: true,
      isCancelled: false,
      processedMessageIds: ['1'],
      failedMessageIds: [],
    });

    expect(setBadgeText).toHaveBeenCalledWith({ text: '4' });
  });
});
