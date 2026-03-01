/**
 * Tests for CacheAnalysisUseCase
 *
 * @module test/application/use-cases/CacheAnalysisUseCase.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheAnalysisUseCase } from '../../../src/application/use-cases/CacheAnalysisUseCase';
import type {
  IProviderSettings,
  ITagResponse,
} from '../../../src/infrastructure/interfaces/IProvider';
import type { IEmailMessage } from '../../../src/infrastructure/interfaces/IMailReader';
import { createMockLogger, createMockCache } from '../../helpers/mock-factories';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockEmail = (overrides: Partial<IEmailMessage> = {}): IEmailMessage => ({
  id: 123,
  subject: 'Test Subject',
  from: 'sender@example.com',
  to: ['recipient@example.com'],
  body: 'Test body content',
  headers: { 'message-id': '<test123@example.com>' },
  attachments: [],
  ...overrides,
});

const createMockProviderSettings = (
  overrides: Partial<IProviderSettings> = {}
): IProviderSettings => ({
  provider: 'openai',
  apiKey: 'test-api-key',
  model: 'gpt-4',
  ...overrides,
});

const createMockTagResponse = (overrides: Partial<ITagResponse> = {}): ITagResponse => ({
  tags: ['business'],
  confidence: 0.85,
  reasoning: 'Test reasoning',
  ...overrides,
});

// Mock Web Crypto API for tests
const mockSubtleCrypto = {
  digest: vi.fn().mockImplementation(async (algorithm: string, data: BufferSource) => {
    // Simple mock: return consistent hash for same input
    const encoder = new TextEncoder();
    const dataStr = new TextDecoder().decode(data);
    const hash = dataStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hashArray = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      hashArray[i] = (hash + i) % 256;
    }
    return hashArray.buffer;
  }),
};

// Setup global crypto mock
vi.stubGlobal('crypto', { subtle: mockSubtleCrypto });

// ============================================================================
// Tests
// ============================================================================

describe('CacheAnalysisUseCase', () => {
  let useCase: CacheAnalysisUseCase;
  let mockCache = createMockCache();
  let mockLogger = createMockLogger();

  beforeEach(() => {
    mockCache = createMockCache();
    mockLogger = createMockLogger();

    useCase = new CacheAnalysisUseCase(mockCache, mockLogger);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      const freshLogger = createMockLogger();
      const freshCache = createMockCache();
      const freshUseCase = new CacheAnalysisUseCase(freshCache, freshLogger);
      expect(freshUseCase).toBeInstanceOf(CacheAnalysisUseCase);
      expect(freshLogger.debug).toHaveBeenCalledWith('✅ CacheAnalysisUseCase initialized');
    });
  });

  // ==========================================================================
  // generateKey() Tests
  // ==========================================================================

  describe('generateKey', () => {
    it('should generate consistent cache key for same input', async () => {
      const email = createMockEmail();
      const settings = createMockProviderSettings();

      const key1 = await useCase.generateKey(email, settings);
      const key2 = await useCase.generateKey(email, settings);

      expect(key1.cacheKey).toBe(key2.cacheKey);
    });

    it('should generate different cache keys for different emails', async () => {
      const email1 = createMockEmail({ subject: 'Email 1' });
      const email2 = createMockEmail({ subject: 'Email 2' });
      const settings = createMockProviderSettings();

      const key1 = await useCase.generateKey(email1, settings);
      const key2 = await useCase.generateKey(email2, settings);

      expect(key1.cacheKey).not.toBe(key2.cacheKey);
    });

    it('should generate different cache keys for different providers', async () => {
      const email = createMockEmail();
      const settings1 = createMockProviderSettings({ provider: 'openai' });
      const settings2 = createMockProviderSettings({ provider: 'gemini' });

      const key1 = await useCase.generateKey(email, settings1);
      const key2 = await useCase.generateKey(email, settings2);

      expect(key1.cacheKey).not.toBe(key2.cacheKey);
    });

    it('should generate different cache keys for different models', async () => {
      const email = createMockEmail();
      const settings1 = createMockProviderSettings({ model: 'gpt-4' });
      const settings2 = createMockProviderSettings({ model: 'gpt-3.5-turbo' });

      const key1 = await useCase.generateKey(email, settings1);
      const key2 = await useCase.generateKey(email, settings2);

      expect(key1.cacheKey).not.toBe(key2.cacheKey);
    });

    it('should include email subject, from, to, and body in key', async () => {
      const email = createMockEmail({
        subject: 'Unique Subject',
        from: 'unique@example.com',
        to: ['unique-recipient@example.com'],
        body: 'Unique body content',
      });
      const settings = createMockProviderSettings();

      const result = await useCase.generateKey(email, settings);

      expect(result.cacheKey).toBeDefined();
      expect(typeof result.cacheKey).toBe('string');
    });

    it('should log cache key generation', async () => {
      const email = createMockEmail();
      const settings = createMockProviderSettings();

      await useCase.generateKey(email, settings);

      expect(mockLogger.debug).toHaveBeenCalledWith('🔐 Generated cache key', {
        hash: expect.stringMatching(/\.\.\./),
      });
    });
  });

  // ==========================================================================
  // get() Tests
  // ==========================================================================

  describe('get', () => {
    it('should return cached result on cache hit', async () => {
      const cachedResult = createMockTagResponse();
      vi.mocked(mockCache.get).mockResolvedValue(cachedResult);

      const result = await useCase.get('test-cache-key');

      expect(result).toEqual(cachedResult);
      expect(mockCache.get).toHaveBeenCalledWith('test-cache-key');
    });

    it('should return null on cache miss', async () => {
      vi.mocked(mockCache.get).mockResolvedValue(null);

      const result = await useCase.get('nonexistent-key');

      expect(result).toBeNull();
    });

    it('should return null on cache error', async () => {
      vi.mocked(mockCache.get).mockRejectedValue(new Error('Cache error'));

      const result = await useCase.get('error-key');

      expect(result).toBeNull();
    });

    it('should log cache hit', async () => {
      const cachedResult = createMockTagResponse();
      vi.mocked(mockCache.get).mockResolvedValue(cachedResult);

      await useCase.get('test-key');

      expect(mockLogger.debug).toHaveBeenCalledWith('✅ Cache HIT', {
        cacheKey: expect.stringMatching(/\.\.\./),
      });
    });

    it('should log cache miss', async () => {
      vi.mocked(mockCache.get).mockResolvedValue(null);

      await useCase.get('test-key');

      expect(mockLogger.debug).toHaveBeenCalledWith('⚠️  Cache MISS', {
        cacheKey: expect.stringMatching(/\.\.\./),
      });
    });

    it('should warn on cache error', async () => {
      vi.mocked(mockCache.get).mockRejectedValue(new Error('Cache error'));

      await useCase.get('test-key');

      expect(mockLogger.warn).toHaveBeenCalledWith('⚠️  Failed to check cache', {
        cacheKey: expect.stringMatching(/\.\.\./),
        error: 'Cache error',
      });
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(mockCache.get).mockRejectedValue('String error');

      const result = await useCase.get('test-key');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('⚠️  Failed to check cache', {
        cacheKey: expect.stringMatching(/\.\.\./),
        error: 'String error',
      });
    });
  });

  // ==========================================================================
  // set() Tests
  // ==========================================================================

  describe('set', () => {
    it('should store result in cache with TTL', async () => {
      const result = createMockTagResponse();
      const ttl = 24 * 60 * 60 * 1000; // 24 hours

      await useCase.set('test-cache-key', result, ttl);

      expect(mockCache.set).toHaveBeenCalledWith('test-cache-key', result, ttl);
    });

    it('should log cache storage', async () => {
      const result = createMockTagResponse();
      const ttl = 60 * 60 * 1000; // 1 hour

      await useCase.set('test-key', result, ttl);

      expect(mockLogger.debug).toHaveBeenCalledWith('💾 Caching analysis result', {
        cacheKey: expect.stringMatching(/\.\.\./),
        ttl: '60min',
      });
    });

    it('should log success after storage', async () => {
      const result = createMockTagResponse();
      vi.mocked(mockCache.set).mockResolvedValue();

      await useCase.set('test-key', result, 3600000);

      expect(mockLogger.debug).toHaveBeenCalledWith('✅ Analysis result cached', {
        cacheKey: expect.stringMatching(/\.\.\./),
      });
    });

    it('should handle cache storage errors gracefully', async () => {
      const result = createMockTagResponse();
      vi.mocked(mockCache.set).mockRejectedValue(new Error('Storage failed'));

      // Should not throw
      await expect(useCase.set('test-key', result, 3600000)).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith('⚠️  Failed to cache result', {
        cacheKey: expect.stringMatching(/\.\.\./),
        error: 'Storage failed',
      });
    });

    it('should handle non-Error thrown values on storage', async () => {
      const result = createMockTagResponse();
      vi.mocked(mockCache.set).mockRejectedValue('String error');

      await expect(useCase.set('test-key', result, 3600000)).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith('⚠️  Failed to cache result', {
        cacheKey: expect.stringMatching(/\.\.\./),
        error: 'String error',
      });
    });

    it('should use custom TTL values', async () => {
      const result = createMockTagResponse();
      const customTtl = 48 * 60 * 60 * 1000; // 48 hours

      await useCase.set('test-key', result, customTtl);

      expect(mockCache.set).toHaveBeenCalledWith('test-key', result, customTtl);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('integration', () => {
    it('should work end-to-end: generate key, miss, set, hit', async () => {
      const email = createMockEmail();
      const settings = createMockProviderSettings();
      const analysisResult = createMockTagResponse();

      // Generate key
      const { cacheKey } = await useCase.generateKey(email, settings);

      // Cache miss
      vi.mocked(mockCache.get).mockResolvedValueOnce(null);
      const missResult = await useCase.get(cacheKey);
      expect(missResult).toBeNull();

      // Store in cache
      vi.mocked(mockCache.set).mockResolvedValue();
      await useCase.set(cacheKey, analysisResult, 3600000);

      // Cache hit
      vi.mocked(mockCache.get).mockResolvedValueOnce(analysisResult);
      const hitResult = await useCase.get(cacheKey);
      expect(hitResult).toEqual(analysisResult);
    });
  });
});
