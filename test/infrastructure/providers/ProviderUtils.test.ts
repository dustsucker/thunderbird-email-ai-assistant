/**
 * Unit tests for ProviderUtils bug fixes:
 * - DW8a: HTTP errors carry numeric `.status` → retryWithBackoff retries 429/5xx
 * - DW8b: percent-scale confidence normalized to 0-1
 * - DW8c: extractJson ignores braces inside JSON string values
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { retryWithBackoff, validateLLMResponse, extractJson } from '../../../src/infrastructure/providers/ProviderUtils';
import { sharedLogger } from '../../../src/infrastructure/logger/ConsoleLogger';
import {
  BaseProvider,
  type BaseProviderSettings,
  type RequestBody,
  type TagResponse,
} from '../../../src/infrastructure/providers/BaseProvider';
import type { StructuredEmailData } from '../../../src/shared/types/EmailPart';
import type { CustomTags } from '../../../src/shared/types/TagTypes';
import {
  createMockFetchResponse,
  createMockFetchError,
} from './provider-test-utils';

// Minimal concrete provider to exercise the shared transport (executeRequest)
class TestProvider extends BaseProvider {
  protected getApiUrl(settings?: BaseProviderSettings): string {
    return settings?.apiUrl ?? 'https://api.test.com/v1/chat';
  }
  protected buildRequestBody(): RequestBody {
    return { prompt: 'test' };
  }
  protected parseResponse(response: unknown): TagResponse {
    return response as TagResponse;
  }
  public validateSettings(): boolean {
    return true;
  }
}

const fastRetry = { maxRetries: 2, baseDelay: 1, factor: 1, jitter: 0 };

describe('ProviderUtils fixes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // DW8a: retry on retryable HTTP status
  // ==========================================================================

  describe('DW8a: HTTP status retry', () => {
    it('executeRequest throws errors with numeric .status (429)', async () => {
      const provider = new TestProvider(5000, fastRetry);
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(createMockFetchError(429, 'Too Many Requests'));

      await expect(
        provider.analyze({
          settings: { model: 'm' },
          structuredData: { headers: {}, body: 'b', attachments: [] } as StructuredEmailData,
          customTags: [] as unknown as CustomTags,
        })
      ).rejects.toMatchObject({ status: 429 });

      // maxRetries=2 → 3 attempts total
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('retries a 429 then succeeds on 200 (fetch called exactly twice)', async () => {
      const provider = new TestProvider(5000, fastRetry);
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(createMockFetchError(429, 'Too Many Requests'))
        .mockResolvedValueOnce(
          createMockFetchResponse({
            tags: ['business'],
            confidence: 0.8,
            reasoning: 'ok',
          })
        );

      const result = await provider.analyze({
        settings: { model: 'm' },
        structuredData: { headers: {}, body: 'b', attachments: [] } as StructuredEmailData,
        customTags: [] as unknown as CustomTags,
      });

      expect(result.confidence).toBe(0.8);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retryWithBackoff does not retry non-retryable status (400)', async () => {
      const fn = vi.fn().mockImplementation(() => {
        const err: Error & { status?: number } = new Error('API request failed: 400 Bad Request');
        err.status = 400;
        throw err;
      });

      await expect(retryWithBackoff(fn, fastRetry)).rejects.toMatchObject({ status: 400 });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries a RESOLVED result carrying a retryable .status (429) and succeeds', async () => {
      // V3: the resolved-result branch must throw an error with numeric .status,
      // otherwise it is classified non-transient and never retried.
      const fn = vi
        .fn()
        .mockResolvedValueOnce({ status: 429, ok: false })
        .mockResolvedValueOnce({ status: 200, ok: true, value: 'done' });

      const result = await retryWithBackoff(fn, fastRetry);

      expect(result).toMatchObject({ status: 200, value: 'done' });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('retries a resolved 429 result until maxRetries and throws with .status', async () => {
      const fn = vi.fn().mockResolvedValue({ status: 429, ok: false });

      await expect(retryWithBackoff(fn, fastRetry)).rejects.toMatchObject({ status: 429 });
      // maxRetries=2 → 3 attempts total
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // DW8b: confidence normalization
  // ==========================================================================

  describe('DW8b: confidence normalization', () => {
    it('normalizes percent-scale confidence 85 → 0.85', () => {
      const result = validateLLMResponse('{"tags": ["work"], "confidence": 85}');
      expect(result.confidence).toBe(0.85);
    });

    it('keeps already-normalized confidence 0.85', () => {
      const result = validateLLMResponse('{"tags": ["work"], "confidence": 0.85}');
      expect(result.confidence).toBe(0.85);
    });

    it('normalizes object input with percent scale', () => {
      const result = validateLLMResponse({ tags: [], confidence: 100 });
      expect(result.confidence).toBe(1);
    });
  });

  // ==========================================================================
  // DW8c: extractJson with braces in string values
  // ==========================================================================

  describe('DW8c: extractJson string-aware brace counting', () => {
    it('handles braces inside JSON string values', () => {
      const text = 'Here is the result: {"tags": ["work"], "confidence": 0.8, "reasoning": "use the { bracket"} done';
      const extracted = extractJson(text);
      expect(JSON.parse(extracted)).toEqual({
        tags: ['work'],
        confidence: 0.8,
        reasoning: 'use the { bracket',
      });
    });

    it('handles closing brace and escaped quote in string values', () => {
      const text = '{"reasoning": "has } and \\" escaped"}';
      const extracted = extractJson(text);
      expect(JSON.parse(extracted)).toEqual({ reasoning: 'has } and " escaped' });
    });
  });

  // ==========================================================================

  describe('issue #7: retry attempt logging', () => {
    it('logs one debug per retry attempt and one warn on exhaustion', async () => {
      const debugSpy = vi.spyOn(sharedLogger, 'debug').mockImplementation(() => {});
      const warnSpy = vi.spyOn(sharedLogger, 'warn').mockImplementation(() => {});

      let calls = 0;
      const flaky = vi.fn(async () => {
        calls++;
        if (calls < 3) {
          throw Object.assign(new Error('boom'), { status: 500 });
        }
        return { ok: true };
      });

      const result = await retryWithBackoff(flaky, fastRetry, { runId: 'run-42' });
      expect(result).toEqual({ ok: true });

      // two retries -> two debug logs with attempt metadata + runId context
      const retryLogs = debugSpy.mock.calls.filter((c) => c[0] === 'Retrying request after failure');
      expect(retryLogs).toHaveLength(2);
      expect(retryLogs[0][1]).toMatchObject({ attempt: 1, max: 3, statusCode: 500, runId: 'run-42' });

      // success path -> no exhaustion warn
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns once when all retries are exhausted', async () => {
      const debugSpy = vi.spyOn(sharedLogger, 'debug').mockImplementation(() => {});
      const warnSpy = vi.spyOn(sharedLogger, 'warn').mockImplementation(() => {});

      const always500 = vi.fn(async () => {
        throw Object.assign(new Error('boom'), { status: 500 });
      });

      await expect(retryWithBackoff(always500, fastRetry)).rejects.toThrow('boom');

      const warns = warnSpy.mock.calls.filter((c) => c[0] === 'Request retries exhausted');
      expect(warns).toHaveLength(1);
      expect(warns[0][1]).toMatchObject({ attempts: fastRetry.maxRetries + 1, statusCode: 500 });
      // retries were attempted (debug logs present), but only one warn
      expect(debugSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
