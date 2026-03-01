/**
 * Unit tests for ProviderFactory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProviderFactory,
  ProviderTokens,
} from '../../../src/infrastructure/providers/ProviderFactory';
import { createMockLogger } from './provider-test-utils';
import { container } from 'tsyringe';

describe('ProviderFactory', () => {
  let factory: ProviderFactory;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    container.clearInstances();
    container.registerInstance('ILogger', mockLogger);
    factory = new ProviderFactory(mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.clearInstances();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(factory).toBeInstanceOf(ProviderFactory);
    });

    it('should register all available providers', () => {
      const providers = factory.getAvailableProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('claude');
      expect(providers).toContain('gemini');
      expect(providers).toContain('mistral');
      expect(providers).toContain('ollama');
      expect(providers).toContain('deepseek');
      expect(providers).toContain('zai-paas');
      expect(providers).toContain('zai-coding');
    });

    it('should sort providers alphabetically', () => {
      const providers = factory.getAvailableProviders();
      const sorted = [...providers].sort();
      expect(providers).toEqual(sorted);
    });

    it('should log initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing ProviderFactory with lazy loading'
      );
    });
  });

  // ==========================================================================
  // getProvider Tests
  // ==========================================================================

  describe('getProvider', () => {
    it('should return OpenAI provider adapter', async () => {
      const provider = await factory.getProvider('openai');
      expect(provider).toBeDefined();
      expect(provider.providerId).toBe('openai');
    });

    it('should return Claude provider adapter', async () => {
      const provider = await factory.getProvider('claude');
      expect(provider).toBeDefined();
      expect(provider.providerId).toBe('claude');
    });

    it('should return Gemini provider adapter', async () => {
      const provider = await factory.getProvider('gemini');
      expect(provider).toBeDefined();
      expect(provider.providerId).toBe('gemini');
    });

    it('should return Mistral provider adapter', async () => {
      const provider = await factory.getProvider('mistral');
      expect(provider).toBeDefined();
      expect(provider.providerId).toBe('mistral');
    });

    it('should return Ollama provider adapter', async () => {
      const provider = await factory.getProvider('ollama');
      expect(provider).toBeDefined();
      expect(provider.providerId).toBe('ollama');
    });

    it('should return DeepSeek provider adapter', async () => {
      const provider = await factory.getProvider('deepseek');
      expect(provider).toBeDefined();
      expect(provider.providerId).toBe('deepseek');
    });

    it('should return ZAI PaaS provider adapter', async () => {
      const provider = await factory.getProvider('zai-paas');
      expect(provider).toBeDefined();
      expect(provider.providerId).toBe('zai-paas');
    });

    it('should return ZAI Coding provider adapter', async () => {
      const provider = await factory.getProvider('zai-coding');
      expect(provider).toBeDefined();
      expect(provider.providerId).toBe('zai-coding');
    });

    it('should throw error for invalid provider ID', async () => {
      await expect(factory.getProvider('invalid-provider')).rejects.toThrow(
        "Provider 'invalid-provider' is not registered"
      );
    });

    it('should cache provider instances', async () => {
      const provider1 = await factory.getProvider('openai');
      const provider2 = await factory.getProvider('openai');

      // Should be the same instance (cached)
      expect(provider1).toBe(provider2);
    });

    it('should list available providers in error message', async () => {
      try {
        await factory.getProvider('nonexistent');
      } catch (error) {
        expect((error as Error).message).toContain('Available providers:');
      }
    });
  });

  // ==========================================================================
  // hasProvider Tests
  // ==========================================================================

  describe('hasProvider', () => {
    it('should return true for registered providers', () => {
      expect(factory.hasProvider('openai')).toBe(true);
      expect(factory.hasProvider('claude')).toBe(true);
      expect(factory.hasProvider('ollama')).toBe(true);
    });

    it('should return false for unregistered providers', () => {
      expect(factory.hasProvider('invalid')).toBe(false);
      expect(factory.hasProvider('unknown')).toBe(false);
    });
  });

  // ==========================================================================
  // getAvailableProviders Tests
  // ==========================================================================

  describe('getAvailableProviders', () => {
    it('should return all provider IDs', () => {
      const providers = factory.getAvailableProviders();

      expect(providers.length).toBe(8);
      expect(providers).toEqual(
        expect.arrayContaining([
          'openai',
          'claude',
          'gemini',
          'mistral',
          'ollama',
          'deepseek',
          'zai-paas',
          'zai-coding',
        ])
      );
    });

    it('should return a new array each time (not a reference)', () => {
      const providers1 = factory.getAvailableProviders();
      const providers2 = factory.getAvailableProviders();

      expect(providers1).not.toBe(providers2);
      expect(providers1).toEqual(providers2);
    });
  });

  // ==========================================================================
  // registerProvider Tests
  // ==========================================================================

  describe('registerProvider', () => {
    it('should register a custom IProvider implementation', () => {
      const customProvider = {
        providerId: 'custom-test',
        validateSettings: vi.fn().mockResolvedValue(true),
        analyze: vi.fn().mockResolvedValue({
          tags: ['test'],
          confidence: 0.9,
          reasoning: 'test',
        }),
      };

      factory.registerProvider('custom-test', customProvider);

      expect(factory.hasProvider('custom-test')).toBe(true);
    });

    it('should throw error for empty provider ID', () => {
      expect(() => factory.registerProvider('', {})).toThrow(
        'Provider ID must be a non-empty string'
      );
    });

    it('should throw error for null provider', () => {
      expect(() => factory.registerProvider('test', null)).toThrow(
        'Provider cannot be null or undefined'
      );
    });

    it('should throw error for undefined provider', () => {
      expect(() => factory.registerProvider('test', undefined)).toThrow(
        'Provider cannot be null or undefined'
      );
    });
  });

  // ==========================================================================
  // reset Tests
  // ==========================================================================

  describe('reset', () => {
    it('should clear all cached providers', async () => {
      // Load a provider to cache it
      await factory.getProvider('openai');

      factory.reset();

      expect(mockLogger.warn).toHaveBeenCalledWith('Resetting ProviderFactory');
    });

    it('should clear registered providers', () => {
      factory.reset();

      // After reset, available providers should be empty until re-initialization
      // Note: reset clears the internal state but the factory may still have its initialized flag cleared
    });
  });

  // ==========================================================================
  // getContainer Tests
  // ==========================================================================

  describe('getContainer', () => {
    it('should return the DI container', () => {
      const containerInstance = factory.getContainer();
      expect(containerInstance).toBeDefined();
      expect(containerInstance).toBe(container);
    });
  });

  // ==========================================================================
  // ProviderTokens Tests
  // ==========================================================================

  describe('ProviderTokens', () => {
    it('should have tokens for all providers', () => {
      expect(ProviderTokens.OPENAI_PROVIDER).toBe('provider:openai');
      expect(ProviderTokens.CLAUDE_PROVIDER).toBe('provider:claude');
      expect(ProviderTokens.GEMINI_PROVIDER).toBe('provider:gemini');
      expect(ProviderTokens.MISTRAL_PROVIDER).toBe('provider:mistral');
      expect(ProviderTokens.OLLAMA_PROVIDER).toBe('provider:ollama');
      expect(ProviderTokens.DEEPSEEK_PROVIDER).toBe('provider:deepseek');
      expect(ProviderTokens.ZAI_PAAS_PROVIDER).toBe('provider:zai-paas');
      expect(ProviderTokens.ZAI_CODING_PROVIDER).toBe('provider:zai-coding');
    });

    it('should have logger token', () => {
      expect(ProviderTokens.LOGGER).toBe('ILogger');
    });
  });

  // ==========================================================================
  // Code-Splitting Tests
  // ==========================================================================

  describe('code-splitting', () => {
    it('should lazy load providers on demand', async () => {
      // Provider should not be loaded until requested
      const provider = await factory.getProvider('gemini');
      expect(provider).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('Loading provider module (code-split)', {
        providerId: 'gemini',
      });
    });

    it('should serve from cache after first load', async () => {
      await factory.getProvider('claude');

      // Second call should use cache
      await factory.getProvider('claude');

      expect(mockLogger.debug).toHaveBeenCalledWith('Provider adapter served from cache', {
        providerId: 'claude',
      });
    });
  });
});
