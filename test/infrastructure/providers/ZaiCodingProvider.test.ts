/**
 * Unit tests for ZaiCodingProvider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZaiCodingProvider } from '../../../src/infrastructure/providers/impl/ZaiCodingProvider';
import {
  createMockLogger,
  createMockStructuredData,
  createMockCustomTags,
  createMockFetchResponse,
  createMockFetchError,
  validTagResponse,
} from './provider-test-utils';
import type { BaseProviderSettings } from '../../../src/infrastructure/providers/BaseProvider';
import type { IRuntimeProviderSettings } from '../../../src/infrastructure/interfaces/IProvider';

describe('ZaiCodingProvider', () => {
  let provider: ZaiCodingProvider;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const validSettings: BaseProviderSettings = {
    apiKey: 'test-zai-coding-api-key-12345',
    model: 'glm-4.7',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    provider = new ZaiCodingProvider(mockLogger);
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
      expect(provider).toBeInstanceOf(ZaiCodingProvider);
      expect(provider.providerId).toBe('zai-coding');
    });

    it('should log initialization', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('ZaiCodingProvider initialized');
    });
  });

  // ==========================================================================
  // validateSettings Tests
  // ==========================================================================

  describe('validateSettings', () => {
    it('should return true for valid settings with apiKey', () => {
      expect(provider.validateSettings(validSettings)).toBe(true);
    });

    it('should store custom model when provided', () => {
      const customModelSettings: BaseProviderSettings = {
        apiKey: 'test-api-key-long-enough-123',
        model: 'glm-4.7-custom',
      };
      provider.validateSettings(customModelSettings);

      expect(provider['zaiModel']).toBe('glm-4.7-custom');
    });

    it('should store custom API URL when provided', () => {
      const customUrlSettings: BaseProviderSettings = {
        apiKey: 'test-api-key-long-enough-123',
        apiUrl: 'https://custom.api.z.ai/v1/chat',
      };
      provider.validateSettings(customUrlSettings);

      expect(provider['zaiBaseUrl']).toBe('https://custom.api.z.ai/v1/chat');
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
        'Z.ai Coding settings validation failed',
        expect.objectContaining({
          error: expect.any(String),
          hasApiKey: false,
        })
      );
    });
  });

  // ==========================================================================
  // analyze Tests - Success Cases
  // ==========================================================================

  describe('analyze', () => {
    const createZaiResponse = (content: string) => ({
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1705315000,
      model: 'glm-4.7',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    });

    it('should successfully analyze email and return tags', async () => {
      const zaiResponse = createZaiResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(zaiResponse));

      const result = await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(result.tags).toEqual(['business']);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('This email appears to be business-related.');
    });

    it('should send correct request body with thinking enabled', async () => {
      const zaiResponse = createZaiResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(zaiResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.model).toBe('glm-4.7');
      expect(body.thinking).toEqual({ type: 'enabled' });
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(4000);
      expect(body.messages).toBeInstanceOf(Array);
    });

    it('should include Authorization header with Bearer token', async () => {
      const zaiResponse = createZaiResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(zaiResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;

      expect(headers['Authorization']).toBe(`Bearer ${validSettings.apiKey}`);
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should call Z.ai API URL', async () => {
      const zaiResponse = createZaiResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(zaiResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.z.ai/api/paas/v4/chat/completions',
        expect.anything()
      );
    });

    it('should use custom base URL when configured', async () => {
      const customUrl = 'https://custom.z.ai/api/v1/chat';
      const settingsWithCustomUrl: BaseProviderSettings = {
        apiKey: 'test-api-key-long-enough-123',
        apiUrl: customUrl,
        model: 'glm-4.7',
      };

      const zaiResponse = createZaiResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(zaiResponse));

      await provider.analyze({
        settings: settingsWithCustomUrl,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(fetchSpy).toHaveBeenCalledWith(customUrl, expect.anything());
    });

    it('should extract JSON from response content', async () => {
      const contentWithExtraText = `Analysis result: ${JSON.stringify(validTagResponse)}`;
      const zaiResponse = createZaiResponse(contentWithExtraText);
      fetchSpy.mockResolvedValue(createMockFetchResponse(zaiResponse));

      const result = await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(result.tags).toEqual(['business']);
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
      fetchSpy.mockRejectedValue(new Error('Network error'));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow();
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

    it('should throw error on ZAI error response format', async () => {
      const errorResponse = {
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(errorResponse));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid response format from Z.ai API');
    });

    it('should throw error on invalid response structure', async () => {
      fetchSpy.mockResolvedValue(createMockFetchResponse({ invalid: 'response' }));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid response format from Z.ai API');
    });

    it('should throw error when content is missing', async () => {
      const noContentResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        model: 'glm-4.7',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 },
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(noContentResponse));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid response format: missing content');
    });
  });

  // ==========================================================================
  // listModels Tests
  // ==========================================================================

  describe('listModels', () => {
    it('should return list of available models', async () => {
      const modelsResponse = {
        object: 'list',
        data: [{ id: 'glm-4.7', object: 'model' }],
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      const models = await provider.listModels(validSettings as IRuntimeProviderSettings);

      expect(models).toEqual(['glm-4.7']);
    });

    it('should throw error when API key is missing', async () => {
      await expect(provider.listModels({})).rejects.toThrow('API key is required to list models');
    });

    it('should return fallback models on fetch error', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const models = await provider.listModels(validSettings as IRuntimeProviderSettings);

      expect(models).toEqual(['glm-4.7']);
    });

    it('should call correct models endpoint', async () => {
      const modelsResponse = { object: 'list', data: [] };
      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      await provider.listModels(validSettings as IRuntimeProviderSettings);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.z.ai/api/paas/v4/models',
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${validSettings.apiKey}`,
          },
        })
      );
    });
  });
});
