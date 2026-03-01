/**
 * Unit tests for OpenAIProvider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../../src/infrastructure/providers/impl/OpenAIProvider';
import {
  createMockLogger,
  createMockStructuredData,
  createMockCustomTags,
  createMockFetchResponse,
  createMockFetchError,
  validTagResponse,
} from './provider-test-utils';
import type { BaseProviderSettings } from '../../../src/infrastructure/providers/BaseProvider';

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const validSettings: BaseProviderSettings = {
    apiKey: 'sk-test-api-key-12345',
    model: 'gpt-4o',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    provider = new OpenAIProvider(mockLogger);
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
      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.providerId).toBe('openai');
    });

    it('should log initialization', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('OpenAIProvider initialized');
    });
  });

  // ==========================================================================
  // validateSettings Tests
  // ==========================================================================

  describe('validateSettings', () => {
    it('should return true for valid settings with apiKey', () => {
      expect(provider.validateSettings(validSettings)).toBe(true);
    });

    it('should return true for valid OpenAI API key with sk- prefix', () => {
      const settings: BaseProviderSettings = {
        apiKey: 'sk-valid-openai-key-12345678',
      };
      expect(provider.validateSettings(settings)).toBe(true);
    });

    it('should return false when apiKey is missing', () => {
      expect(provider.validateSettings({})).toBe(false);
    });

    it('should return false when apiKey is empty string', () => {
      const settings: BaseProviderSettings = {
        apiKey: '',
      };
      expect(provider.validateSettings(settings)).toBe(false);
    });

    it('should return false when apiKey is undefined', () => {
      const settings: BaseProviderSettings = {
        apiKey: undefined,
      };
      expect(provider.validateSettings(settings)).toBe(false);
    });

    it('should log error when apiKey is not set', () => {
      provider.validateSettings({});
      expect(mockLogger.error).toHaveBeenCalledWith(
        'OpenAI settings validation failed',
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
    it('should successfully analyze email and return tags', async () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1705315000,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify(validTagResponse),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(openaiResponse));

      const result = await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(result.tags).toEqual(['business']);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('This email appears to be business-related.');
    });

    it('should send correct request body with messages', async () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1705315000,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify(validTagResponse),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(openaiResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData({ body: 'Test email' }),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.model).toBe('gpt-4o');
      expect(body.messages).toBeInstanceOf(Array);
      expect(body.messages[0]).toHaveProperty('role', 'system');
      expect(body.messages[1]).toHaveProperty('role', 'user');
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('should include Authorization header with Bearer token', async () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1705315000,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify(validTagResponse),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(openaiResponse));

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

    it('should call OpenAI API URL', async () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1705315000,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify(validTagResponse),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(openaiResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.anything()
      );
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

    it('should throw error on rate limit (429)', async () => {
      fetchSpy.mockResolvedValue(createMockFetchError(429, 'Too Many Requests'));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('API request failed');
    });

    it('should throw error on OpenAI error response format', async () => {
      const errorResponse = {
        error: {
          message: 'Invalid API key',
          type: 'invalid_request_error',
          param: null,
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
      ).rejects.toThrow('Invalid response format from OpenAI API');
    });

    it('should throw error when choices array is empty', async () => {
      const emptyChoicesResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1705315000,
        model: 'gpt-4o',
        choices: [],
        usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 },
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(emptyChoicesResponse));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid response format from OpenAI API');
    });

    it('should throw error when message content is missing', async () => {
      const noContentResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1705315000,
        model: 'gpt-4o',
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

    it('should throw error on invalid JSON in response content', async () => {
      const invalidJsonResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1705315000,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'not valid json',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(invalidJsonResponse));

      // OpenAI provider throws on invalid JSON
      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // listModels Tests
  // ==========================================================================

  describe('listModels', () => {
    it('should return list of available models', async () => {
      const modelsResponse = {
        object: 'list',
        data: [
          { id: 'gpt-4o', object: 'model', created: 1700000000, owned_by: 'openai' },
          { id: 'gpt-4-turbo', object: 'model', created: 1700000000, owned_by: 'openai' },
          { id: 'gpt-3.5-turbo', object: 'model', created: 1700000000, owned_by: 'openai' },
        ],
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      const models = await provider.listModels(validSettings);

      expect(models).toEqual(['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']);
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

    it('should return empty array on non-OK response', async () => {
      fetchSpy.mockResolvedValue(createMockFetchError(500, 'Internal Server Error'));

      const models = await provider.listModels(validSettings);

      expect(models).toEqual([]);
    });

    it('should call correct models endpoint', async () => {
      const modelsResponse = { object: 'list', data: [] };
      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      await provider.listModels(validSettings);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${validSettings.apiKey}`,
          },
        })
      );
    });
  });
});
