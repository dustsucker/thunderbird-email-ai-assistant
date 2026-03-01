/**
 * Unit tests for MistralProvider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MistralProvider } from '../../../src/infrastructure/providers/impl/MistralProvider';
import {
  createMockLogger,
  createMockStructuredData,
  createMockCustomTags,
  createMockFetchResponse,
  createMockFetchError,
  validTagResponse,
} from './provider-test-utils';
import type { BaseProviderSettings } from '../../../src/infrastructure/providers/BaseProvider';

describe('MistralProvider', () => {
  let provider: MistralProvider;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const validSettings: BaseProviderSettings = {
    apiKey: 'test-mistral-api-key-12345',
    model: 'mistral-large-latest',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    provider = new MistralProvider(mockLogger);
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
      expect(provider).toBeInstanceOf(MistralProvider);
      expect(provider.providerId).toBe('mistral');
    });

    it('should log initialization', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('MistralProvider initialized');
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
      expect(mockLogger.error).toHaveBeenCalledWith('Mistral Error: API key is not set.');
    });
  });

  // ==========================================================================
  // analyze Tests - Success Cases
  // ==========================================================================

  describe('analyze', () => {
    const createMistralResponse = (content: string) => ({
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1705315000,
      model: 'mistral-large-latest',
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
      const mistralResponse = createMistralResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(mistralResponse));

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
      const mistralResponse = createMistralResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(mistralResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.model).toBe('mistral-large-latest');
      expect(body.messages).toBeInstanceOf(Array);
      expect(body.messages[0]).toHaveProperty('role', 'system');
      expect(body.messages[1]).toHaveProperty('role', 'user');
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('should include Authorization header with Bearer token', async () => {
      const mistralResponse = createMistralResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(mistralResponse));

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

    it('should call Mistral API URL', async () => {
      const mistralResponse = createMistralResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(mistralResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/chat/completions',
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

    it('should throw error on Mistral error response format', async () => {
      const errorResponse = {
        message: 'Invalid API key',
        type: 'invalid_request_error',
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(errorResponse));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Mistral API error');
    });

    it('should throw error on invalid response structure', async () => {
      fetchSpy.mockResolvedValue(createMockFetchResponse({ invalid: 'response' }));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid response structure from Mistral API');
    });

    it('should throw error when choices array is empty', async () => {
      const emptyChoicesResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1705315000,
        model: 'mistral-large-latest',
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
      ).rejects.toThrow('Invalid response structure from Mistral API');
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
          { id: 'mistral-large-latest', object: 'model', created: 1700000000, owned_by: 'mistral' },
          { id: 'mistral-medium', object: 'model', created: 1700000000, owned_by: 'mistral' },
          { id: 'mistral-small', object: 'model', created: 1700000000, owned_by: 'mistral' },
        ],
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      const models = await provider.listModels(validSettings);

      expect(models).toEqual(['mistral-large-latest', 'mistral-medium', 'mistral-small']);
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

    it('should call correct models endpoint', async () => {
      const modelsResponse = { object: 'list', data: [] };
      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      await provider.listModels(validSettings);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/models',
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${validSettings.apiKey}`,
          },
        })
      );
    });
  });
});
