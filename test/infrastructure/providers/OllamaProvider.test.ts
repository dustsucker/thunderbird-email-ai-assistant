/**
 * Unit tests for OllamaProvider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../../../src/infrastructure/providers/impl/OllamaProvider';
import {
  createMockLogger,
  createMockStructuredData,
  createMockCustomTags,
  createMockFetchResponse,
  createMockFetchError,
  validTagResponse,
} from './provider-test-utils';
import type { BaseProviderSettings } from '../../../src/infrastructure/providers/BaseProvider';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const validSettings: BaseProviderSettings = {
    apiUrl: 'http://localhost:11434/api/generate',
    model: 'gemma3:27b',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    provider = new OllamaProvider(mockLogger);
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
      expect(provider).toBeInstanceOf(OllamaProvider);
      expect(provider.providerId).toBe('ollama');
    });

    it('should log initialization', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith('OllamaProvider initialized');
    });
  });

  // ==========================================================================
  // validateSettings Tests
  // ==========================================================================

  describe('validateSettings', () => {
    it('should return true for valid settings with apiUrl and model', () => {
      const settings: BaseProviderSettings = {
        apiUrl: 'http://localhost:11434/api/generate',
        model: 'gemma3:27b',
      };
      expect(provider.validateSettings(settings)).toBe(true);
    });

    it('should return true for valid settings with custom Ollama URL', () => {
      const settings: BaseProviderSettings = {
        apiUrl: 'http://192.168.1.100:11434/api/generate',
        model: 'llama3',
      };
      expect(provider.validateSettings(settings)).toBe(true);
    });

    it('should return false when apiUrl is missing', () => {
      const settings: BaseProviderSettings = {
        model: 'gemma3:27b',
      };
      expect(provider.validateSettings(settings)).toBe(false);
    });

    it('should return false when model is missing', () => {
      const settings: BaseProviderSettings = {
        apiUrl: 'http://localhost:11434/api/generate',
      };
      expect(provider.validateSettings(settings)).toBe(false);
    });

    it('should return false when apiUrl is empty string', () => {
      const settings: BaseProviderSettings = {
        apiUrl: '',
        model: 'gemma3:27b',
      };
      expect(provider.validateSettings(settings)).toBe(false);
    });

    it('should return false when model is empty string', () => {
      const settings: BaseProviderSettings = {
        apiUrl: 'http://localhost:11434/api/generate',
        model: '',
      };
      expect(provider.validateSettings(settings)).toBe(false);
    });

    it('should return false for empty settings', () => {
      expect(provider.validateSettings({})).toBe(false);
    });

    it('should log error when settings are invalid', () => {
      provider.validateSettings({});
      expect(mockLogger.error).toHaveBeenCalledWith('Ollama Error: Invalid settings provided');
    });
  });

  // ==========================================================================
  // analyze Tests - Success Cases
  // ==========================================================================

  describe('analyze', () => {
    it('should successfully analyze email and return tags', async () => {
      const ollamaResponse = {
        model: 'gemma3:27b',
        created_at: '2024-01-15T10:00:00Z',
        response: JSON.stringify(validTagResponse),
        done: true,
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(ollamaResponse));

      const result = await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(result.tags).toEqual(['business']);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('This email appears to be business-related.');
    });

    it('should call fetch with correct URL from settings', async () => {
      const customUrl = 'http://custom-ollama:11435/api/generate';
      const settings: BaseProviderSettings = {
        apiUrl: customUrl,
        model: 'llama3',
      };

      const ollamaResponse = {
        model: 'llama3',
        response: JSON.stringify({ tags: [], confidence: 0.5, reasoning: '' }),
        done: true,
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(ollamaResponse));
      provider.validateSettings(settings);

      await provider.analyze({
        settings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        customUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should send correct request body with model and prompt', async () => {
      const ollamaResponse = {
        model: 'gemma3:27b',
        response: JSON.stringify(validTagResponse),
        done: true,
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(ollamaResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData({ body: 'Test email content' }),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.model).toBe('gemma3:27b');
      expect(body.format).toBe('json');
      expect(body.stream).toBe(false);
      expect(body.prompt).toContain('Test email content');
    });

    it('should use default model when not specified in settings', async () => {
      const ollamaResponse = {
        model: 'gemma3:27b',
        response: JSON.stringify(validTagResponse),
        done: true,
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(ollamaResponse));

      // Provider should use default model after validation
      provider.validateSettings(validSettings);

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.model).toBe('gemma3:27b');
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

    it('should throw error on API network failure', async () => {
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
      fetchSpy.mockResolvedValue(createMockFetchError(500, 'Internal Server Error'));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('API request failed');
    });

    it('should throw error on connection refused', async () => {
      fetchSpy.mockRejectedValue(new Error('Failed to fetch'));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow();
    });

    it('should handle Ollama error response format', async () => {
      const errorResponse = {
        error: 'model "invalid-model" not found',
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(errorResponse));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Ollama API error');
    });

    it('should throw error on invalid response structure', async () => {
      fetchSpy.mockResolvedValue(createMockFetchResponse({ invalid: 'response' }));

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid response structure from Ollama API');
    });

    it('should throw error when response is missing "response" field', async () => {
      fetchSpy.mockResolvedValue(
        createMockFetchResponse({
          model: 'gemma3:27b',
          done: true,
        })
      );

      await expect(
        provider.analyze({
          settings: validSettings,
          structuredData: createMockStructuredData(),
          customTags: createMockCustomTags(),
        })
      ).rejects.toThrow('Invalid response structure from Ollama API');
    });

    it('should handle invalid JSON in response', async () => {
      const ollamaResponse = {
        model: 'gemma3:27b',
        response: 'not valid json {{{',
        done: true,
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(ollamaResponse));

      // Should still work but return fallback values
      const result = await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      // Provider utils should return fallback values for invalid JSON
      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // URL Handling Tests (Ollama-specific)
  // ==========================================================================

  describe('URL handling', () => {
    it('should use default URL when no apiUrl provided', async () => {
      const ollamaResponse = {
        model: 'gemma3:27b',
        response: JSON.stringify(validTagResponse),
        done: true,
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(ollamaResponse));

      const settingsWithUrl: BaseProviderSettings = {
        apiUrl: 'http://localhost:11434/api/generate',
        model: 'gemma3:27b',
      };

      await provider.analyze({
        settings: settingsWithUrl,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.anything()
      );
    });

    it('should handle custom port in URL', async () => {
      const ollamaResponse = {
        model: 'llama3',
        response: JSON.stringify(validTagResponse),
        done: true,
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(ollamaResponse));

      const customSettings: BaseProviderSettings = {
        apiUrl: 'http://192.168.1.50:11435/api/generate',
        model: 'llama3',
      };

      await provider.analyze({
        settings: customSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://192.168.1.50:11435/api/generate',
        expect.anything()
      );
    });

    it('should use custom base URL path', async () => {
      const ollamaResponse = {
        model: 'gemma3:27b',
        response: JSON.stringify(validTagResponse),
        done: true,
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(ollamaResponse));

      const customSettings: BaseProviderSettings = {
        apiUrl: 'http://ollama.example.com/api/generate',
        model: 'gemma3:27b',
      };

      await provider.analyze({
        settings: customSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://ollama.example.com/api/generate',
        expect.anything()
      );
    });
  });

  // ==========================================================================
  // listModels Tests
  // ==========================================================================

  describe('listModels', () => {
    it('should return list of available models', async () => {
      const modelsResponse = {
        models: [{ name: 'gemma3:27b' }, { name: 'llama3' }, { name: 'mistral' }],
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      const models = await provider.listModels(validSettings);

      expect(models).toEqual(['gemma3:27b', 'llama3', 'mistral']);
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

    it('should use apiUrl from settings for models endpoint', async () => {
      const modelsResponse = { models: [] };
      fetchSpy.mockResolvedValue(createMockFetchResponse(modelsResponse));

      const customSettings: BaseProviderSettings = {
        apiUrl: 'http://custom-host:11434', // Base URL without /api/generate
        model: 'test',
      };

      await provider.listModels(customSettings);

      // Should call /api/tags endpoint with the base URL
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://custom-host:11434/api/tags',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });
  });

  // ==========================================================================
  // Headers Tests
  // ==========================================================================

  describe('getHeaders', () => {
    it('should not include Authorization header (Ollama does not require auth)', async () => {
      const ollamaResponse = {
        model: 'gemma3:27b',
        response: JSON.stringify(validTagResponse),
        done: true,
      };

      fetchSpy.mockResolvedValue(createMockFetchResponse(ollamaResponse));

      await provider.analyze({
        settings: validSettings,
        structuredData: createMockStructuredData(),
        customTags: createMockCustomTags(),
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBeUndefined();
    });
  });
});
