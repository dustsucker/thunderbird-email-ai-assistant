/**
 * Unit tests for BaseProvider transport behaviour (issue #41):
 * - Retry-After parsing on 429 ( honour / fallback edge cases )
 * - AbortSignal propagation from analyze() down to the real fetch call
 * - Timeout abort with listener cleanup (no second-abort effect)
 *
 * Fetch is mocked at the global fetch level (the real call site in
 * BaseProvider.fetchWithTimeout), and the mock honours the AbortSignal
 * it receives — like a real fetch would.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BaseProvider,
  type BaseProviderSettings,
  type RequestBody,
  type ProviderResponse,
  type TagResponse,
} from '../../../src/infrastructure/providers/BaseProvider';
import type { StructuredEmailData } from '../../../src/shared/types/EmailPart';
import type { CustomTags } from '../../../src/shared/types/TagTypes';
import type { RetryConfig } from '../../../src/infrastructure/providers/ProviderUtils';
import {
  createMockStructuredData,
  createMockCustomTags,
  createMockFetchResponse,
  createMockFetchError,
  validTagResponse,
} from './provider-test-utils';

// ============================================================================
// TEST PROVIDER (minimal concrete BaseProvider)
// ============================================================================

/** Minimal concrete provider exposing BaseProvider's protected transport. */
class TestProvider extends BaseProvider {
  protected getApiUrl(): string {
    return 'https://api.test.example/v1/analyze';
  }

  protected buildRequestBody(): RequestBody {
    return { prompt: 'test' };
  }

  protected parseResponse(response: ProviderResponse): TagResponse {
    return response as TagResponse;
  }

  public validateSettings(_settings: BaseProviderSettings): boolean {
    return true;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function makeAbortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Mock-fetch helper mimicking real fetch semantics: hangs until the signal
 * passed by the provider aborts. Fails the test if no signal is handed down.
 */
function hangUntilAborted(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (!signal) {
      reject(new Error('provider did not pass an AbortSignal to fetch'));
      return;
    }
    if (signal.aborted) {
      reject(makeAbortError());
      return;
    }
    signal.addEventListener('abort', () => reject(makeAbortError()), { once: true });
  });
}

function makeAnalyzeInput(signal?: AbortSignal) {
  return {
    settings: { apiKey: 'test-api-key-123', model: 'test-model' } as BaseProviderSettings,
    structuredData: createMockStructuredData() as StructuredEmailData,
    customTags: createMockCustomTags() as CustomTags,
    ...(signal ? { signal } : {}),
  };
}

/** Deterministic retry config: no jitter, so delays are exactly predictable. */
function deterministicRetryConfig(overrides: RetryConfig = {}): RetryConfig {
  return { maxRetries: 1, baseDelay: 1000, factor: 2, jitter: 0, ...overrides };
}

// ============================================================================
// TESTS
// ============================================================================

describe('BaseProvider (issue #41: Retry-After + AbortSignal)', () => {
  let provider: TestProvider;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    provider = new TestProvider(120000, deterministicRetryConfig());
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Gap 1: Retry-After parsing (BaseProvider.parseRetryAfter → ProviderUtils)
  // ==========================================================================

  describe('Retry-After handling on 429', () => {
    it('retries a 429 with Retry-After: 120 exactly once after 120000 ms', async () => {
      vi.useFakeTimers();
      fetchSpy
        .mockResolvedValueOnce(createMockFetchError(429, 'Too Many Requests', undefined, '120'))
        .mockResolvedValueOnce(createMockFetchResponse(validTagResponse));

      const promise = provider.analyze(makeAnalyzeInput());
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(119_999);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Retry-After not yet elapsed — no retry

      await vi.advanceTimersByTimeAsync(1);
      expect(fetchSpy).toHaveBeenCalledTimes(2); // exactly one retry, exactly after 120000 ms

      await expect(promise).resolves.toMatchObject({ tags: validTagResponse.tags });
    });

    it.each([
      { label: 'missing header (null)', retryAfter: null as string | null },
      { label: 'garbage header ("foo")', retryAfter: 'foo' },
      { label: 'duplicate headers joined ("120, 60")', retryAfter: '120, 60' },
    ])(
      'falls back to exponential backoff (1000 ms) on $label instead of garbage',
      async ({ retryAfter }) => {
        vi.useFakeTimers();
        fetchSpy
          .mockResolvedValueOnce(createMockFetchError(429, 'Too Many Requests', undefined, retryAfter))
          .mockResolvedValueOnce(createMockFetchResponse(validTagResponse));

        const promise = provider.analyze(makeAnalyzeInput());
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        // Fallback delay is baseDelay * factor^attempt = 1000 ms, not Retry-After-derived
        await vi.advanceTimersByTimeAsync(999);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(fetchSpy).toHaveBeenCalledTimes(2);

        await expect(promise).resolves.toMatchObject({ tags: validTagResponse.tags });
      }
    );
  });

  // ==========================================================================
  // Gap 2: AbortSignal propagation down to the real fetch
  // ==========================================================================

  describe('external AbortSignal', () => {
    it('passes a signal to every fetch call and aborts it on external abort()', async () => {
      const externalController = new AbortController();
      // maxRetries: 0 — abort must surface immediately, without retry noise
      const noRetryProvider = new TestProvider(120000, deterministicRetryConfig({ maxRetries: 0 }));
      fetchSpy.mockImplementation((_url: string | URL | Request, init?: RequestInit) =>
        hangUntilAborted(init?.signal)
      );

      const promise = noRetryProvider.analyze(makeAnalyzeInput(externalController.signal));
      await new Promise((resolve) => setTimeout(resolve, 0)); // let fetch be invoked
      externalController.abort();

      const error = await promise.then(
        () => {
          throw new Error('expected analyze() to reject after external abort');
        },
        (rejection: unknown) => rejection
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('AbortError');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Proof the signal reached the real fetch call and was aborted there
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.signal?.aborted).toBe(true);
    });

    it('fires the timeout without external abort, removes the abort listener, and completes the retry', async () => {
      vi.useFakeTimers();
      const externalController = new AbortController();
      const removeListenerSpy = vi.spyOn(externalController.signal, 'removeEventListener');
      const timeoutProvider = new TestProvider(1000, deterministicRetryConfig({ baseDelay: 500 }));

      let attempt = 0;
      fetchSpy.mockImplementation((_url: string | URL | Request, init?: RequestInit) => {
        attempt += 1;
        if (attempt === 1) {
          return hangUntilAborted(init?.signal); // hangs until the timeout aborts it
        }
        return Promise.resolve(createMockFetchResponse(validTagResponse));
      });

      const promise = timeoutProvider.analyze(makeAnalyzeInput(externalController.signal));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(externalController.signal.aborted).toBe(false); // timeout, not external abort

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // timeout at 1000 ms has not fired yet

      await vi.advanceTimersByTimeAsync(1); // timeout fires → attempt 1 aborts
      await vi.advanceTimersByTimeAsync(500); // backoff → attempt 2 succeeds

      const result = await promise;
      expect(result.tags).toEqual(validTagResponse.tags);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Listener cleanup: the attempt removed its external-abort listener
      expect(removeListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function));

      // No second-abort effect: aborting after completion triggers no further fetch
      externalController.abort();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
