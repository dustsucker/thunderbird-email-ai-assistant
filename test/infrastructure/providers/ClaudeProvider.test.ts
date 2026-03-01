/**
 * Unit tests for ClaudeProvider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeProvider } from '../../../src/infrastructure/providers/impl/ClaudeProvider';
import {
  createMockLogger,
  createMockStructuredData,
  createMockCustomTags,
  createMockFetchResponse,
  createMockFetchError,
  validTagResponse,
} from './provider-test-utils';
import type { BaseProviderSettings } from '../../../src/infrastructure/providers/BaseProvider';

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const validSettings: BaseProviderSettings = {
    apiKey: 'sk-ant-test-api-key-12345',
    model: 'claude-sonnet-4-0',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    provider = new ClaudeProvider(mockLogger);
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
      expect(provider).toBeInstanceOf(ClaudeProvider);
      expect(provider.providerId).toBe('claude');
    });

    it('should log initialization', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('ClaudeProvider initialized');
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
      expect(mockLogger.error).toHaveBeenCalledWith('Claude Error: API key is not set.');
    });
  });

  // ==========================================================================
  // analyze Tests - Success Cases
  // ==========================================================================

  describe('analyze', () => {
    const createClaudeResponse = (content: string) => ({
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: content }],
      model: 'claude-sonnet-4-0',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    it('should successfully analyze email and return tags', async () => {
      const claudeResponse = createClaudeResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(claudeResponse));

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
      const claudeResponse = createClaudeResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(claudeResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.model).toBe('claude-sonnet-4-0');
      expect(body.max_tokens).toBe(4096);
      expect(body.system).toBeDefined();
      expect(body.messages).toBeInstanceOf(Array);
      expect(body.messages[0]).toHaveProperty('role', 'user');
    });

    it('should use x-api-key header instead of Authorization', async () => {
      const claudeResponse = createClaudeResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(claudeResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;

      expect(headers['x-api-key']).toBe(validSettings.apiKey);
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should include anthropic-version header', async () => {
      const claudeResponse = createClaudeResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(claudeResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;

      expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('should include anthropic-dangerous-direct-browser-access header', async () => {
      const claudeResponse = createClaudeResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(claudeResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;

      expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    });

    it('should call Anthropic API URL', async () => {
      const claudeResponse = createClaudeResponse(JSON.stringify(validTagResponse));
      fetchSpy.mockResolvedValue(createMockFetchResponse(claudeResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
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

    it('should throw error on invalid response structure', async () => {
      fetchSpy.mockResolvedValue(createMockFetchResponse({ invalid: 'response' }));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid Claude API response structure');
    });

    it('should throw error when content is missing', async () => {
      const noContentResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-sonnet-4-0',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 0 },
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(noContentResponse));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Claude API response missing content text');
    });
  });

  // ==========================================================================
  // listModels Tests
  // ==========================================================================

  describe('listModels', () => {
    it('should return list of available models', async () => {
      const modelsResponse = {
        data: [
          { id: 'claude-sonnet-4-0', type: 'model' },
          { id: 'claude-3-opus', type: 'model' },
        ],
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      const models = await provider.listModels(validSettings);

      expect(models).toEqual(['claude-sonnet-4-0', 'claude-3-opus']);
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
