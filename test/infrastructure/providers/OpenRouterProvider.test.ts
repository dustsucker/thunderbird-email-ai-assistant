/**
 * Unit tests for OpenRouterProvider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from '../../../src/infrastructure/providers/impl/OpenRouterProvider';
import {
  createMockLogger,
  createMockStructuredData,
  createMockCustomTags,
  createMockFetchResponse,
  createMockFetchError,
  validTagResponse,
} from './provider-test-utils';
import type { BaseProviderSettings } from '../../../src/infrastructure/providers/BaseProvider';

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const validSettings: BaseProviderSettings = {
    apiKey: 'sk-or-v1-test-openrouter-api-key-123456',
    model: 'openai/gpt-4o-mini',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    provider = new OpenRouterProvider(mockLogger);
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
      expect(provider).toBeInstanceOf(OpenRouterProvider);
      expect(provider.providerId).toBe('openrouter');
    });

    it('should log initialization', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('OpenRouterProvider initialized');
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

    it('should return false for non-openrouter key format', () => {
      expect(provider.validateSettings({ apiKey: 'not-an-openrouter-key' })).toBe(false);
    });

    it('should log error when apiKey is not set', () => {
      provider.validateSettings({});
      expect(mockLogger.error).toHaveBeenCalledWith(
        'OpenRouter settings validation failed',
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
    const createOpenRouterResponse = (content: string, model: string = 'openai/gpt-4o-mini') => ({
      id: 'gen-123',
      object: 'chat.completion',
      created: 1705315000,
      model,
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
        cost: 0.001,
      },
    });

    it('should successfully analyze email and return tags', async () => {
      const response = createOpenRouterResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(response));

      const result = await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(result.tags).toEqual(['business']);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('This email appears to be business-related.');
    });

    it('should call the exact OpenRouter API URL', async () => {
      const response = createOpenRouterResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(response));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.anything()
      );
    });

    it('should send correct request body with model and messages', async () => {
      const response = createOpenRouterResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(response));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.model).toBe('openai/gpt-4o-mini');
      expect(body.messages).toBeInstanceOf(Array);
      expect(body.messages[0]).toHaveProperty('role', 'system');
      expect(body.messages[1]).toHaveProperty('role', 'user');
      expect(body.stream).toBe(false);
    });

    it('should fall back to default model when settings.model is empty', async () => {
      const response = createOpenRouterResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(response));

      await provider.analyze({
        settings: { apiKey: validSettings.apiKey },
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.model).toBe('openai/gpt-4o-mini');
    });

    it('should include Authorization Bearer header', async () => {
      const response = createOpenRouterResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(response));

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

    it('should include BOTH attribution headers on fetch call', async () => {
      const response = createOpenRouterResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(response));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;

      expect(headers['HTTP-Referer']).toBe(
        'https://github.com/dustsucker/thunderbird-email-ai-assistant'
      );
      expect(headers['X-OpenRouter-Title']).toBe('Thunderbird Email AI Assistant');
    });

    it('should parse choices[0].message.content (OpenAI shape)', async () => {
      const content = JSON.stringify(validTagResponse);
      const response = createOpenRouterResponse(content);
      fetchSpy.mockResolvedValue(createMockFetchResponse(response));

      const result = await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      // Proves parsing came from choices[0].message.content with usage cost fields present
      expect(result.tags).toEqual(validTagResponse.tags);
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

    it('should throw error on non-OK HTTP response with .status', async () => {
      fetchSpy.mockResolvedValue(createMockFetchError(401, 'Unauthorized'));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toMatchObject({ status: 401 });
    });

    it('should throw error on invalid response structure', async () => {
      fetchSpy.mockResolvedValue(createMockFetchResponse({ invalid: 'response' }));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid API response structure');
    });

    it('should throw error when choices array is empty', async () => {
      const emptyChoicesResponse = {
        id: 'gen-123',
        object: 'chat.completion',
        created: 1705315000,
        model: 'openai/gpt-4o-mini',
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
      ).rejects.toThrow('Invalid API response structure');
    });

    it('should throw error when message content is missing', async () => {
      const noContentResponse = {
        id: 'gen-123',
        object: 'chat.completion',
        created: 1705315000,
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant' },
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
      ).rejects.toThrow('Invalid');
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
          { id: 'openai/gpt-4o-mini', object: 'model', created: 1700000000, owned_by: 'openai' },
          { id: 'anthropic/claude-3.5-sonnet', object: 'model', created: 1700000000 },
        ],
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      const models = await provider.listModels(validSettings);

      expect(models).toEqual(['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet']);
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
  });
});
