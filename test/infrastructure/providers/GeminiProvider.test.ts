/**
 * Unit tests for GeminiProvider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from '../../../src/infrastructure/providers/impl/GeminiProvider';
import {
  createMockLogger,
  createMockStructuredData,
  createMockCustomTags,
  createMockFetchResponse,
  createMockFetchError,
  validTagResponse,
} from './provider-test-utils';
import type { BaseProviderSettings } from '../../../src/infrastructure/providers/BaseProvider';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const validSettings: BaseProviderSettings = {
    apiKey: 'test-gemini-api-key-12345',
    model: 'gemini-1.5-flash-latest',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    provider = new GeminiProvider(mockLogger);
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(provider).toBeInstanceOf(GeminiProvider);
      expect(provider.providerId).toBe('gemini');
    });

    it('should log initialization', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('GeminiProvider initialized');
    });
  });

  // ==========================================================================
  // validateSettings Tests
  // ==========================================================================

  describe('validateSettings', () => {
    it('should return true for valid settings with apiKey', () => {
      expect(provider.validateSettings(validSettings)).toBe(true);
    });

    it('should return false when apiKey is missing', () => {
      expect(provider.validateSettings({})).toBe(false);
    });

    it('should return false when apiKey is empty string', () => {
      expect(provider.validateSettings({ apiKey: '' })).toBe(false);
    });

    it('should log error when apiKey is not set', () => {
      provider.validateSettings({});
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Gemini settings validation failed',
        expect.objectContaining({
          error: expect.any(String),
          hasApiKey: false,
        })
      );
    });

    it('should store apiKey after successful validation', () => {
      provider.validateSettings(validSettings);
      // The API URL method uses the stored key
      expect(() => provider['getApiUrl']()).not.toThrow();
    });

    it('should throw error when getApiUrl called without apiKey', () => {
      expect(() => provider['getApiUrl']()).toThrow('Gemini API key is not set');
    });
  });

  // ==========================================================================
  // analyze Tests - Success Cases
  // ==========================================================================

  describe('analyze', () => {
    const createGeminiResponse = (text: string) => ({
      candidates: [
        {
          content: {
            parts: [{ text }],
            role: 'model',
          },
          finishReason: 'STOP',
          index: 0,
          safetyRatings: [],
        },
      ],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
      },
    });

    it('should successfully analyze email and return tags', async () => {
      const geminiResponse = createGeminiResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(geminiResponse));

      const result = await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(result.tags).toEqual(['business']);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('This email appears to be business-related.');
    });

    it('should send correct request body', async () => {
      const geminiResponse = createGeminiResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(geminiResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.contents).toBeInstanceOf(Array);
      expect(body.contents[0]).toHaveProperty('parts');
      expect(body.generationConfig).toEqual({ response_mime_type: 'application/json' });
    });

    it('should include API key in URL query parameter', async () => {
      const geminiResponse = createGeminiResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(geminiResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const url = fetchCall[0] as string;

      expect(url).toContain('key=');
      expect(url).toContain(validSettings.apiKey);
    });

    it('should call Gemini API URL with correct model', async () => {
      const geminiResponse = createGeminiResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(geminiResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const url = fetchCall[0] as string;

      expect(url).toContain('generativelanguage.googleapis.com');
      expect(url).toContain('gemini-1.5-flash-latest');
      expect(url).toContain(':generateContent');
    });

    it('should not include Authorization header (uses URL key)', async () => {
      const geminiResponse = createGeminiResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(geminiResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;

      expect(headers['Authorization']).toBeUndefined();
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  // ==========================================================================
  // analyze Tests - Error Cases
  // ==========================================================================

  describe('analyze error handling', () => {
    it('should throw error when settings are invalid', async () => {
      await expect(
        provider.analyze({
          settings: {},
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid provider settings');
    });

    it('should throw error on API failure', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validTagResponse) }],
            },
            finishReason: 'STOP',
          },
        ],
      };
      fetchSpy.mockResolvedValue(createMockFetchResponse(geminiResponse));

      const result = await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(result).toBeDefined();
    });

    it('should throw error on Gemini error response', async () => {
      const errorResponse = {
        error: {
          code: 400,
          message: 'API key not valid',
          status: 'INVALID_ARGUMENT',
        },
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(errorResponse));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Gemini API Error');
    });

    it('should throw error on invalid response structure', async () => {
      fetchSpy.mockResolvedValue(createMockFetchResponse({ invalid: 'response' }));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid response format: missing candidates field');
    });

    it('should throw error when candidates array is empty', async () => {
      fetchSpy.mockResolvedValue(createMockFetchResponse({ candidates: [] }));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid response format: no candidates returned');
    });

    it('should throw error when content parts are missing', async () => {
      const noContentResponse = {
        candidates: [
          {
            finishReason: 'SAFETY',
          },
        ],
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(noContentResponse));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid response format: missing text content');
    });

    it('should throw error on non-OK HTTP response', async () => {
      fetchSpy.mockResolvedValue(createMockFetchError(401, 'Unauthorized'));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('API request failed');
    });
  });

  // ==========================================================================
  // listModels Tests
  // ==========================================================================

  describe('listModels', () => {
    it('should return list of available generative models', async () => {
      const modelsResponse = {
        models: [
          { name: 'models/gemini-1.5-flash' }, // "flash" contains "generate" pattern
          { name: 'models/gemini-1.5-pro-generate' },
          { name: 'models/gemini-pro-generate' },
        ],
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      const models = await provider.listModels(validSettings);

      // Gemini filters models by checking if name contains "generate"
      expect(models).toEqual(['gemini-1.5-pro-generate', 'gemini-pro-generate']);
    });

    it('should filter models to only generative ones (containing "generate")', async () => {
      const modelsResponse = {
        models: [
          { name: 'models/gemini-1.5-flash-latest' }, // Does NOT contain "generate"
          { name: 'models/text-embedding-gecko' }, // Should be filtered out
          { name: 'models/gemini-pro-generate' }, // Contains "generate"
        ],
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      const models = await provider.listModels(validSettings);

      // Only model with "generate" in name is kept
      expect(models).toEqual(['gemini-pro-generate']);
      expect(models).not.toContain('text-embedding-gecko');
      expect(models).not.toContain('gemini-1.5-flash-latest');
    });

    it('should return empty array when API key is missing', async () => {
      const models = await provider.listModels({});
      expect(models).toEqual([]);
    });

    it('should return empty array on fetch error', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));
      const models = await provider.listModels(validSettings);
      expect(models).toEqual([]);
    });

    it('should call correct models endpoint with API key', async () => {
      const modelsResponse = { models: [] };
      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      await provider.listModels(validSettings);

      const fetchCall = fetchSpy.mock.calls[0];
      const url = fetchCall[0] as string;

      expect(url).toContain('generativelanguage.googleapis.com/v1beta/models');
      expect(url).toContain(`key=${validSettings.apiKey}`);
    });
  });
});
