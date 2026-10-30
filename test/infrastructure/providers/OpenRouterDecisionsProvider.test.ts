/**
 * Unit tests for OpenRouterDecisionsProvider (OpenRouter Decisions API)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenRouterDecisionsProvider,
  getTagThreshold,
} from '../../../src/infrastructure/providers/impl/OpenRouterDecisionsProvider';
import { ProviderFactory } from '../../../src/infrastructure/providers/ProviderFactory';
import {
  createMockLogger,
  createMockStructuredData,
  createMockCustomTags,
  createMockFetchResponse,
} from './provider-test-utils';
import type { BaseProviderSettings } from '../../../src/infrastructure/providers/BaseProvider';
import { container } from 'tsyringe';

const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
const API_KEY = 'sk-or-v1-test-decisions-key-123456';

const validSettings: BaseProviderSettings = {
  apiKey: API_KEY,
  model: 'typesafe/jev-1.14',
};

type Answer = Record<string, unknown>;

/** Decisions response for the three mock tags (business, personal, newsletter) plus scam. */
function decisionsResponse(answers: Answer, model = 'typesafe/jev-1.14@1.2') {
  return { answers, model, usage: { input_tokens: 120, output_tokens: 4, cost: 0.00042 } };
}

function noul(value: number) {
  return { type: 'noul', noul: value };
}

describe('OpenRouterDecisionsProvider', () => {
  let provider: OpenRouterDecisionsProvider;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  /** Every POST body in call order. */
  let sentBodies: Answer[];
  /** Response for the decisions call. */
  let decisionsResult: unknown;

  const analyze = (settings: BaseProviderSettings = validSettings) =>
    provider.analyze({
      settings,
      structuredData: createMockStructuredData(),
      customTags: createMockCustomTags(),
    });

  /** The decisions request body. */
  const decisionsBody = () => sentBodies[0];

  beforeEach(() => {
    mockLogger = createMockLogger();
    provider = new OpenRouterDecisionsProvider(mockLogger);
    sentBodies = [];
    decisionsResult = createMockFetchResponse(decisionsResponse({}));
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((async (
      _url: RequestInfo | URL,
      init?: RequestInit
    ) => {
      sentBodies.push(JSON.parse(String(init?.body)));
      return decisionsResult as Response;
    }) as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Thresholding
  // ==========================================================================

  describe('thresholding', () => {
    it('includes a tag above the threshold (p=0.91)', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(0.91), tag_1: noul(0.1), tag_2: noul(0.1) })
      );

      const result = await analyze();
      expect(result.tags).toContain('business');
    });

    it('excludes a tag below the threshold (p=0.42)', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(0.91), tag_1: noul(0.42), tag_2: noul(0.1) })
      );

      const result = await analyze();
      expect(result.tags).not.toContain('personal');
    });

    it('sets confidence to the minimum probability among included tags', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(0.91), tag_1: noul(0.77), tag_2: noul(0.42) })
      );

      const result = await analyze();
      expect(result.tags).toEqual(['business', 'personal']);
      expect(result.confidence).toBe(0.77);
    });

    it('returns no tags and confidence 0 when every tag is below threshold', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(0.42), tag_1: noul(0.1), tag_2: noul(0.2) })
      );

      const result = await analyze();
      expect(result.tags).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    it('honours additionalConfig.tagThreshold and clamps it to 0..1', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(0.5), tag_1: noul(0.5) })
      );

      const low = await analyze({ ...validSettings, additionalConfig: { tagThreshold: 0.4 } });
      expect(low.tags).toEqual(['business', 'personal']);

      const clamped = await analyze({ ...validSettings, additionalConfig: { tagThreshold: 7 } });
      expect(clamped.tags).toEqual([]);
    });

    it('defaults the threshold to 0.6', () => {
      expect(getTagThreshold(validSettings)).toBe(0.6);
      expect(getTagThreshold({ additionalConfig: { tagThreshold: '0.9' } })).toBe(0.6);
      expect(getTagThreshold({ additionalConfig: { tagThreshold: -1 } })).toBe(0);
    });
  });

  // ==========================================================================
  // Malformed answers
  // ==========================================================================

  describe('malformed answers', () => {
    it('skips answers without a numeric noul and does not crash', async () => {
      decisionsResult = createMockFetchResponse({
        answers: {
          tag_0: { type: 'noul' },
          tag_1: { type: 'noul', noul: 'high' },
          tag_2: { type: 'choice', choice: 'yes' },
          scam: noul(0.05),
        },
        model: 'typesafe/jev-1.14',
      });

      const result = await analyze();
      expect(result.tags).toEqual([]);
      expect(result.confidence).toBe(0);
      expect(result.is_scam).toBe(false);
      expect(result.reasoning).toContain('tags: none');
    });

    it.each([['5', 5], ['-0.1', -0.1]])(
      'excludes an out-of-range probability (noul: %s) without throwing',
      async (_label, value) => {
        decisionsResult = createMockFetchResponse(
          decisionsResponse({ tag_0: noul(value), tag_1: noul(0.1), tag_2: noul(0.1) })
        );

        const result = await analyze();
        expect(result.tags).toEqual([]);
        expect(result.confidence).toBe(0);
        expect(result.reasoning).toContain('tags: personal=0.100, newsletter=0.100');
      }
    );

    it('keeps the boundary value 1 as an included tag', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(1), tag_1: noul(0.1), tag_2: noul(0.1) })
      );

      const result = await analyze();
      expect(result.tags).toEqual(['business']);
      expect(result.confidence).toBe(1);
    });

    it('excludes 0 by threshold without producing NaN', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(0), tag_1: noul(0.1), tag_2: noul(0.1) })
      );

      const result = await analyze();
      expect(result.tags).toEqual([]);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('business=0.000');
    });

    it('throws naming the model when answers is empty', async () => {
      decisionsResult = createMockFetchResponse({
        answers: {},
        model: 'typesafe/jev-1.14@2.0',
      });

      await expect(analyze()).rejects.toThrow(/typesafe\/jev-1\.14@2\.0/);
    });
  });

  // ==========================================================================
  // Scam decision
  // ==========================================================================

  describe('is_scam', () => {
    it('is true at the threshold boundary', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(0.2), scam: noul(0.6) })
      );
      expect((await analyze()).is_scam).toBe(true);
    });

    it('is false just below the threshold', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(0.2), scam: noul(0.59) })
      );
      expect((await analyze()).is_scam).toBe(false);
    });
  });

  // ==========================================================================
  // Wire format
  // ==========================================================================

  describe('request wire format', () => {
    it('posts to the decisions endpoint with auth and a decisions body', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(0.9), scam: noul(0.01) })
      );

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData({
          headers: { subject: 'Invoice #42', from: 'billing@example.com' },
          body: 'Your monthly bill is attached.',
        }),
        customTags: createMockCustomTags(),
      });

      const decisionsCall = fetchSpy.mock.calls[0] as [string, RequestInit];
      const [url, options] = decisionsCall;
      expect(url).toBe(DECISIONS_URL);
      expect((options as RequestInit).headers).toMatchObject({
        Authorization: `Bearer ${API_KEY}`,
      });

      const body = JSON.parse(String((options as RequestInit).body));
      expect(body.model).toBe('typesafe/jev-1.14');
      expect(body.state).toEqual({
        subject: 'Invoice #42',
        from: 'billing@example.com',
        body: 'Your monthly bill is attached.',
      });

      // One noul per custom tag, plus the scam question
      expect(Object.keys(body.questions).sort()).toEqual(['scam', 'tag_0', 'tag_1', 'tag_2']);
      for (const id of ['tag_0', 'tag_1', 'tag_2', 'scam']) {
        expect(body.questions[id].type).toBe('noul');
        expect(typeof body.questions[id].instructions).toBe('string');
      }
      expect(body.questions.tag_0.instructions).toContain('Business');

      // No chat-completion leftovers
      expect(body).not.toHaveProperty('messages');
      expect(body).not.toHaveProperty('prompt');
      expect(JSON.stringify(body)).not.toContain('AVAILABLE TAGS');
    });

    it('sends tag_0..tag_n in custom tag order', async () => {
      decisionsResult = createMockFetchResponse(decisionsResponse({ tag_0: noul(0.9) }));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const body = decisionsBody();
      const questions = body.questions as Record<string, { instructions: string }>;
      expect(String(questions.tag_1.instructions)).toContain('Personal');
      expect(String(questions.tag_2.instructions)).toContain('Newsletter');
    });

    it('caps the body length in the state payload', async () => {
      decisionsResult = createMockFetchResponse(decisionsResponse({ tag_0: noul(0.9) }));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData({ body: 'x'.repeat(50000) }),
        customTags: createMockCustomTags(),
      });

      expect((decisionsBody().state as Answer).body).toHaveLength(20000);
    });
  });

  // ==========================================================================
  // Reasoning
  // ==========================================================================

  describe('reasoning', () => {
    it('reports resolved model, per-tag probabilities and cost', async () => {
      decisionsResult = createMockFetchResponse(
        decisionsResponse({ tag_0: noul(0.91), scam: noul(0.02) })
      );

      const result = await analyze();
      expect(result.reasoning).toContain('typesafe/jev-1.14@1.2');
      expect(result.reasoning).toContain('business=0.910');
      expect(result.reasoning).toContain('cost=$0.00042');
    });

    it('never treats a missing cost as 0', async () => {
      decisionsResult = createMockFetchResponse({
        answers: { tag_0: noul(0.9) },
        model: 'typesafe/jev-1.14',
      });

      const result = await analyze();
      expect(result.reasoning).toContain('cost=n/a');
      expect(result.reasoning).not.toContain('cost=$0');
    });
  });

  // ==========================================================================
  // validateSettings
  // ==========================================================================

  describe('validateSettings', () => {
    it('returns true for a valid key and model without any fetch', () => {
      expect(provider.validateSettings(validSettings)).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['missing', { apiKey: undefined, model: 'typesafe/jev-1.14' }],
      ['blank', { apiKey: '   ', model: 'typesafe/jev-1.14' }],
      ['too short', { apiKey: 'sk-or-x', model: 'typesafe/jev-1.14' }],
    ])('returns false for a %s API key without any fetch', (_label, settings) => {
      expect(provider.validateSettings(settings as unknown as BaseProviderSettings)).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['missing', { apiKey: API_KEY, model: undefined }],
      ['blank', { apiKey: API_KEY, model: '   ' }],
    ])('returns false for a %s model without any fetch', (_label, settings) => {
      expect(provider.validateSettings(settings as unknown as BaseProviderSettings)).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Factory
  // ==========================================================================

  describe('ProviderFactory integration', () => {
    beforeEach(() => {
      container.clearInstances();
      container.registerInstance('ILogger', mockLogger);
    });

    it("resolves 'openrouter-decisions' to OpenRouterDecisionsProvider", async () => {
      const factory = new ProviderFactory(mockLogger);
      expect(factory.hasProvider('openrouter-decisions')).toBe(true);

      const resolved = await factory.getProvider('openrouter-decisions');
      // Factory wraps BaseProvider implementations in BaseProviderAdapter
      expect(resolved.providerId).toBe('openrouter-decisions');
      expect(resolved.analyze).toBeInstanceOf(Function);
    });
  });
});
