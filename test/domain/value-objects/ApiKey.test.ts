import { describe, it, expect } from 'vitest';
import { ApiKey, InvalidApiKeyError, isInvalidApiKeyError } from '@/domain/value-objects';

describe('ApiKey', () => {
  describe('constructor', () => {
    it('should create a valid API key', () => {
      const key = new ApiKey('sk-proj-abc123def456');
      expect(key.value).toBe('sk-proj-abc123def456');
    });

    it('should trim whitespace', () => {
      const key = new ApiKey('  sk-proj-abc123  ');
      expect(key.value).toBe('sk-proj-abc123');
    });

    it('should store provider name', () => {
      const key = new ApiKey('sk-proj-abc123', 'openai');
      expect(key.provider).toBe('openai');
    });

    it('should throw InvalidApiKeyError for empty string', () => {
      expect(() => new ApiKey('')).toThrow(InvalidApiKeyError);
      expect(() => new ApiKey('   ')).toThrow(InvalidApiKeyError);
    });

    it('should throw InvalidApiKeyError for key shorter than minimum', () => {
      expect(() => new ApiKey('short')).toThrow(InvalidApiKeyError);
    });

    it('should throw InvalidApiKeyError for key with control characters', () => {
      expect(() => new ApiKey('sk-proj-abc\x00def')).toThrow(InvalidApiKeyError);
    });

    it('should throw InvalidApiKeyError for key with whitespace inside', () => {
      expect(() => new ApiKey('sk-proj abc123')).toThrow(InvalidApiKeyError);
    });

    it('should throw InvalidApiKeyError for key exceeding max length', () => {
      const longKey = 'sk-' + 'a'.repeat(300);
      expect(() => new ApiKey(longKey)).toThrow(InvalidApiKeyError);
    });

    it('should include provider in error message when provided', () => {
      try {
        new ApiKey('', 'openai');
      } catch (error) {
        expect((error as Error).message).toContain('openai');
      }
    });
  });

  describe('masked', () => {
    it('should mask short keys (<=8 chars)', () => {
      const key = new ApiKey('12345678');
      expect(key.masked).toBe('12***');
    });

    it('should mask medium keys (<=16 chars)', () => {
      const key = new ApiKey('1234567890123456');
      expect(key.masked).toBe('1234***456');
    });

    it('should mask long keys (>16 chars)', () => {
      const key = new ApiKey('sk-proj-abc123def456ghi789');
      expect(key.masked).toBe('sk-p***i789');
    });

    it('should never expose full key in masked output', () => {
      const fullKey = 'sk-proj-super-secret-key-12345';
      const key = new ApiKey(fullKey);
      expect(key.masked).not.toContain('super-secret-key');
    });
  });

  describe('hasPrefix', () => {
    it('should return true when key has prefix', () => {
      const key = new ApiKey('sk-proj-abc123');
      expect(key.hasPrefix('sk-')).toBe(true);
      expect(key.hasPrefix('sk-proj-')).toBe(true);
    });

    it('should return false when key does not have prefix', () => {
      const key = new ApiKey('AIza-abc123');
      expect(key.hasPrefix('sk-')).toBe(false);
    });
  });

  describe('isOpenAI', () => {
    it('should return true for OpenAI-style keys', () => {
      expect(new ApiKey('sk-abc123').isOpenAI()).toBe(true);
      expect(new ApiKey('sk-proj-abc').isOpenAI()).toBe(true);
    });

    it('should return false for non-OpenAI keys', () => {
      expect(new ApiKey('AIza-abc123').isOpenAI()).toBe(false);
    });
  });

  describe('isGemini', () => {
    it('should return true for Gemini-style keys', () => {
      expect(new ApiKey('AIza-abc12345678').isGemini()).toBe(true);
    });

    it('should return false for non-Gemini keys', () => {
      expect(new ApiKey('sk-abc123').isGemini()).toBe(false);
    });
  });

  describe('isClaude', () => {
    it('should return true for Claude-style keys', () => {
      expect(new ApiKey('sk-ant-abc123').isClaude()).toBe(true);
    });

    it('should return false for non-Claude keys', () => {
      expect(new ApiKey('sk-abc123').isClaude()).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for same key', () => {
      const key1 = new ApiKey('sk-proj-abc123');
      const key2 = new ApiKey('sk-proj-abc123');
      expect(key1.equals(key2)).toBe(true);
    });

    it('should return false for different keys', () => {
      const key1 = new ApiKey('sk-proj-abc123');
      const key2 = new ApiKey('sk-proj-xyz789');
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return masked value, never full key', () => {
      const key = new ApiKey('sk-proj-secret-key-12345');
      expect(key.toString()).toBe(key.masked);
      expect(key.toString()).not.toContain('secret-key');
    });
  });

  describe('toJSON', () => {
    it('should return masked value for JSON serialization', () => {
      const key = new ApiKey('sk-proj-secret-key-12345');
      expect(key.toJSON()).toBe(key.masked);
      expect(JSON.stringify({ apiKey: key })).not.toContain('secret-key');
    });
  });

  describe('static isValid', () => {
    it('should return true for valid key', () => {
      expect(ApiKey.isValid('sk-proj-abc123')).toBe(true);
    });

    it('should return false for invalid key', () => {
      expect(ApiKey.isValid('')).toBe(false);
      expect(ApiKey.isValid('short')).toBe(false);
    });
  });

  describe('static tryCreate', () => {
    it('should return ApiKey for valid key', () => {
      const result = ApiKey.tryCreate('sk-proj-abc123');
      expect(result).toBeInstanceOf(ApiKey);
      expect(result?.value).toBe('sk-proj-abc123');
    });

    it('should return null for invalid key', () => {
      const result = ApiKey.tryCreate('short');
      expect(result).toBeNull();
    });

    it('should pass provider to constructor', () => {
      const result = ApiKey.tryCreate('sk-proj-abc123', 'openai');
      expect(result?.provider).toBe('openai');
    });
  });

  describe('static empty', () => {
    it('should create empty key', () => {
      const key = ApiKey.empty();
      expect(key.isEmpty()).toBe(true);
      expect(key.value).toBe('');
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty key', () => {
      const key = ApiKey.empty();
      expect(key.isEmpty()).toBe(true);
    });

    it('should return false for non-empty key', () => {
      const key = new ApiKey('sk-proj-abc123');
      expect(key.isEmpty()).toBe(false);
    });
  });
});

describe('InvalidApiKeyError', () => {
  it('should have correct name', () => {
    try {
      throw new InvalidApiKeyError('test error');
    } catch (error) {
      expect((error as Error).name).toBe('InvalidApiKeyError');
    }
  });

  it('should include provider when provided', () => {
    try {
      throw new InvalidApiKeyError('test error', 'openai');
    } catch (error) {
      expect((error as InvalidApiKeyError).provider).toBe('openai');
      expect((error as Error).message).toContain('openai');
    }
  });

  it('should not include provider when not provided', () => {
    try {
      throw new InvalidApiKeyError('test error');
    } catch (error) {
      expect((error as InvalidApiKeyError).provider).toBeUndefined();
    }
  });
});

describe('isInvalidApiKeyError', () => {
  it('should return true for InvalidApiKeyError', () => {
    const error = new InvalidApiKeyError('test');
    expect(isInvalidApiKeyError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('regular error');
    expect(isInvalidApiKeyError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isInvalidApiKeyError('string')).toBe(false);
    expect(isInvalidApiKeyError(null)).toBe(false);
    expect(isInvalidApiKeyError(undefined)).toBe(false);
  });
});
