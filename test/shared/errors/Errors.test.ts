import { describe, it, expect } from 'vitest';
import {
  DomainError,
  InfrastructureError,
  ApplicationError,
  ProviderInitializationError,
  ProviderRequestError,
  ProviderResponseError,
  ProviderRateLimitError,
  EmailAnalysisError,
  EmailRetrievalError,
  TagApplicationError,
  CacheError,
  BatchAnalysisError,
  ConfigurationError,
  DependencyInjectionError,
  PROVIDER_ERROR_CODES,
  ANALYSIS_ERROR_CODES,
} from '../../../src/shared/errors';

// Concrete implementations for testing abstract classes
class TestDomainError extends DomainError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'TestDomainError';
  }
}

class TestInfrastructureError extends InfrastructureError {
  constructor(message: string, code: string, cause?: Error, context?: Record<string, unknown>) {
    super(message, code, cause, context);
    this.name = 'TestInfrastructureError';
  }
}

class TestApplicationError extends ApplicationError {
  constructor(message: string, code: string, cause?: Error, context?: Record<string, unknown>) {
    super(message, code, cause, context);
    this.name = 'TestApplicationError';
  }
}

// ============================================================================
// BASE ERROR CLASSES
// ============================================================================

describe('BaseErrors', () => {
  describe('DomainError', () => {
    it('should create error with message and code', () => {
      const error = new TestDomainError('Test message', 'TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('TestDomainError');
    });

    it('should store context when provided', () => {
      const context = { userId: '123', action: 'test' };
      const error = new TestDomainError('Test', 'CODE', context);
      expect(error.context).toEqual(context);
    });

    it('should have undefined context when not provided', () => {
      const error = new TestDomainError('Test', 'CODE');
      expect(error.context).toBeUndefined();
    });

    it('should be instance of Error', () => {
      const error = new TestDomainError('Test', 'CODE');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have stack trace', () => {
      const error = new TestDomainError('Test', 'CODE');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TestDomainError');
    });
  });

  describe('InfrastructureError', () => {
    it('should create error with message, code, and cause', () => {
      const cause = new Error('Original error');
      const error = new TestInfrastructureError('Test message', 'TEST_CODE', cause);
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.cause).toBe(cause);
    });

    it('should store context when provided', () => {
      const context = { provider: 'openai', attempt: 1 };
      const error = new TestInfrastructureError('Test', 'CODE', undefined, context);
      expect(error.context).toEqual(context);
    });

    it('should work without cause or context', () => {
      const error = new TestInfrastructureError('Test', 'CODE');
      expect(error.cause).toBeUndefined();
      expect(error.context).toBeUndefined();
    });

    it('should be instance of Error', () => {
      const error = new TestInfrastructureError('Test', 'CODE');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ApplicationError', () => {
    it('should create error with message, code, and cause', () => {
      const cause = new Error('Original error');
      const error = new TestApplicationError('Test message', 'TEST_CODE', cause);
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.cause).toBe(cause);
    });

    it('should store context when provided', () => {
      const context = { messageId: 'msg-123', step: 'analysis' };
      const error = new TestApplicationError('Test', 'CODE', undefined, context);
      expect(error.context).toEqual(context);
    });

    it('should work without cause or context', () => {
      const error = new TestApplicationError('Test', 'CODE');
      expect(error.cause).toBeUndefined();
      expect(error.context).toBeUndefined();
    });

    it('should be instance of Error', () => {
      const error = new TestApplicationError('Test', 'CODE');
      expect(error).toBeInstanceOf(Error);
    });
  });
});

// ============================================================================
// PROVIDER ERRORS
// ============================================================================

describe('ProviderErrors', () => {
  describe('ProviderInitializationError', () => {
    it('should create error with provider and reason', () => {
      const error = new ProviderInitializationError('openai', 'API key is required');
      expect(error.message).toBe('Failed to initialize openai provider: API key is required');
      expect(error.code).toBe(PROVIDER_ERROR_CODES.INITIALIZATION_FAILED);
      expect(error.name).toBe('ProviderInitializationError');
    });

    it('should include provider and reason in context', () => {
      const error = new ProviderInitializationError('gemini', 'Invalid model');
      expect(error.context).toEqual({
        provider: 'gemini',
        reason: 'Invalid model',
      });
    });

    it('should merge additional context', () => {
      const error = new ProviderInitializationError('ollama', 'Connection refused', {
        apiUrl: 'http://localhost:11434',
      });
      expect(error.context).toEqual({
        provider: 'ollama',
        reason: 'Connection refused',
        apiUrl: 'http://localhost:11434',
      });
    });

    it('should be instance of InfrastructureError', () => {
      const error = new ProviderInitializationError('test', 'reason');
      expect(error).toBeInstanceOf(InfrastructureError);
    });
  });

  describe('ProviderRequestError', () => {
    it('should create error with provider and operation', () => {
      const error = new ProviderRequestError('openai', 'analyze');
      expect(error.message).toBe('openai provider request failed during analyze');
      expect(error.code).toBe(PROVIDER_ERROR_CODES.REQUEST_FAILED);
      expect(error.name).toBe('ProviderRequestError');
    });

    it('should store cause when provided', () => {
      const cause = new Error('Network timeout');
      const error = new ProviderRequestError('claude', 'classify', cause);
      expect(error.cause).toBe(cause);
    });

    it('should include provider and operation in context', () => {
      const error = new ProviderRequestError('mistral', 'embed');
      expect(error.context).toEqual({
        provider: 'mistral',
        operation: 'embed',
      });
    });

    it('should be instance of InfrastructureError', () => {
      const error = new ProviderRequestError('test', 'operation');
      expect(error).toBeInstanceOf(InfrastructureError);
    });
  });

  describe('ProviderResponseError', () => {
    it('should create error with provider and reason', () => {
      const error = new ProviderResponseError('openai', 'Response missing tags array');
      expect(error.message).toBe(
        'openai provider returned invalid response: Response missing tags array'
      );
      expect(error.code).toBe(PROVIDER_ERROR_CODES.RESPONSE_INVALID);
      expect(error.name).toBe('ProviderResponseError');
    });

    it('should store cause when provided', () => {
      const cause = new Error('JSON parse error');
      const error = new ProviderResponseError('gemini', 'Invalid JSON', cause);
      expect(error.cause).toBe(cause);
    });

    it('should include provider and reason in context', () => {
      const error = new ProviderResponseError('deepseek', 'Empty response');
      expect(error.context).toEqual({
        provider: 'deepseek',
        reason: 'Empty response',
      });
    });

    it('should be instance of InfrastructureError', () => {
      const error = new ProviderResponseError('test', 'reason');
      expect(error).toBeInstanceOf(InfrastructureError);
    });
  });

  describe('ProviderRateLimitError', () => {
    it('should create error with provider and default retryAfter', () => {
      const error = new ProviderRateLimitError('openai');
      expect(error.message).toBe('openai provider rate limit exceeded. Retry after 60 seconds.');
      expect(error.code).toBe(PROVIDER_ERROR_CODES.RATE_LIMITED);
      expect(error.retryAfter).toBe(60);
      expect(error.name).toBe('ProviderRateLimitError');
    });

    it('should accept custom retryAfter value', () => {
      const error = new ProviderRateLimitError('gemini', 120);
      expect(error.retryAfter).toBe(120);
      expect(error.message).toContain('120 seconds');
    });

    it('should include retryAfter in context', () => {
      const error = new ProviderRateLimitError('claude', 30);
      expect(error.context).toEqual({
        provider: 'claude',
        retryAfter: 30,
      });
    });

    it('should be instance of InfrastructureError', () => {
      const error = new ProviderRateLimitError('test');
      expect(error).toBeInstanceOf(InfrastructureError);
    });
  });
});

// ============================================================================
// ANALYSIS ERRORS
// ============================================================================

describe('AnalysisErrors', () => {
  describe('EmailAnalysisError', () => {
    it('should create error with messageId and reason', () => {
      const error = new EmailAnalysisError('msg-123', 'Provider request failed');
      expect(error.message).toBe('Email analysis failed for msg-123: Provider request failed');
      expect(error.code).toBe(ANALYSIS_ERROR_CODES.EMAIL_ANALYSIS_FAILED);
      expect(error.name).toBe('EmailAnalysisError');
    });

    it('should store cause when provided', () => {
      const cause = new Error('API error');
      const error = new EmailAnalysisError('msg-456', 'Failed', cause);
      expect(error.cause).toBe(cause);
    });

    it('should include messageId and reason in context', () => {
      const error = new EmailAnalysisError('msg-789', 'Timeout');
      expect(error.context).toEqual({
        messageId: 'msg-789',
        reason: 'Timeout',
      });
    });

    it('should be instance of ApplicationError', () => {
      const error = new EmailAnalysisError('test', 'reason');
      expect(error).toBeInstanceOf(ApplicationError);
    });
  });

  describe('EmailRetrievalError', () => {
    it('should create error with messageId', () => {
      const error = new EmailRetrievalError('msg-123');
      expect(error.message).toBe('Failed to retrieve email msg-123');
      expect(error.code).toBe(ANALYSIS_ERROR_CODES.EMAIL_RETRIEVAL_FAILED);
      expect(error.name).toBe('EmailRetrievalError');
    });

    it('should store cause when provided', () => {
      const cause = new Error('Thunderbird API error');
      const error = new EmailRetrievalError('msg-456', cause);
      expect(error.cause).toBe(cause);
    });

    it('should include messageId in context', () => {
      const error = new EmailRetrievalError('msg-789');
      expect(error.context).toEqual({ messageId: 'msg-789' });
    });

    it('should be instance of ApplicationError', () => {
      const error = new EmailRetrievalError('test');
      expect(error).toBeInstanceOf(ApplicationError);
    });
  });

  describe('TagApplicationError', () => {
    it('should create error with messageId and tags', () => {
      const error = new TagApplicationError('msg-123', ['important', 'work']);
      expect(error.message).toBe('Failed to apply tags [important, work] to email msg-123');
      expect(error.code).toBe(ANALYSIS_ERROR_CODES.TAG_APPLICATION_FAILED);
      expect(error.name).toBe('TagApplicationError');
    });

    it('should handle single tag', () => {
      const error = new TagApplicationError('msg-456', ['spam']);
      expect(error.message).toBe('Failed to apply tags [spam] to email msg-456');
    });

    it('should store cause when provided', () => {
      const cause = new Error('Tag API error');
      const error = new TagApplicationError('msg-789', ['test'], cause);
      expect(error.cause).toBe(cause);
    });

    it('should include messageId and tags in context', () => {
      const error = new TagApplicationError('msg-abc', ['tag1', 'tag2']);
      expect(error.context).toEqual({
        messageId: 'msg-abc',
        tags: ['tag1', 'tag2'],
      });
    });

    it('should be instance of ApplicationError', () => {
      const error = new TagApplicationError('test', ['tag']);
      expect(error).toBeInstanceOf(ApplicationError);
    });
  });

  describe('CacheError', () => {
    it('should create error for read operation', () => {
      const error = new CacheError('read', 'cache-key-123');
      expect(error.message).toBe('Cache read failed for key cache-key-123');
      expect(error.code).toBe(ANALYSIS_ERROR_CODES.CACHE_ERROR);
      expect(error.name).toBe('CacheError');
    });

    it('should create error for write operation', () => {
      const error = new CacheError('write', 'cache-key-456');
      expect(error.message).toBe('Cache write failed for key cache-key-456');
    });

    it('should create error for delete operation', () => {
      const error = new CacheError('delete', 'cache-key-789');
      expect(error.message).toBe('Cache delete failed for key cache-key-789');
    });

    it('should store cause when provided', () => {
      const cause = new Error('Storage quota exceeded');
      const error = new CacheError('write', 'key', cause);
      expect(error.cause).toBe(cause);
    });

    it('should include operation and key in context', () => {
      const error = new CacheError('read', 'my-key');
      expect(error.context).toEqual({
        operation: 'read',
        key: 'my-key',
      });
    });

    it('should be instance of InfrastructureError', () => {
      const error = new CacheError('read', 'key');
      expect(error).toBeInstanceOf(InfrastructureError);
    });
  });

  describe('BatchAnalysisError', () => {
    it('should create error with processed and total counts', () => {
      const error = new BatchAnalysisError(5, 10);
      expect(error.message).toBe('Batch analysis failed after processing 5/10 emails');
      expect(error.code).toBe(ANALYSIS_ERROR_CODES.BATCH_ANALYSIS_FAILED);
      expect(error.name).toBe('BatchAnalysisError');
    });

    it('should store cause when provided', () => {
      const cause = new Error('Provider timeout');
      const error = new BatchAnalysisError(3, 20, cause);
      expect(error.cause).toBe(cause);
    });

    it('should include counts in context', () => {
      const error = new BatchAnalysisError(7, 15);
      expect(error.context).toEqual({
        processedCount: 7,
        totalCount: 15,
      });
    });

    it('should be instance of ApplicationError', () => {
      const error = new BatchAnalysisError(0, 10);
      expect(error).toBeInstanceOf(ApplicationError);
    });
  });

  describe('ConfigurationError', () => {
    it('should create error with message', () => {
      const error = new ConfigurationError('API key is required but not configured');
      expect(error.message).toBe('API key is required but not configured');
      expect(error.code).toBe(ANALYSIS_ERROR_CODES.CONFIGURATION_ERROR);
      expect(error.name).toBe('ConfigurationError');
    });

    it('should store cause when provided', () => {
      const cause = new Error('Config file not found');
      const error = new ConfigurationError('Invalid config', cause);
      expect(error.cause).toBe(cause);
    });

    it('should store context when provided', () => {
      const error = new ConfigurationError('Missing setting', undefined, {
        setting: 'provider',
      });
      expect(error.context).toEqual({ setting: 'provider' });
    });

    it('should be instance of ApplicationError', () => {
      const error = new ConfigurationError('test');
      expect(error).toBeInstanceOf(ApplicationError);
    });
  });

  describe('DependencyInjectionError', () => {
    it('should create error with service name', () => {
      const error = new DependencyInjectionError('AnalyzeEmail');
      expect(error.message).toBe('Failed to resolve AnalyzeEmail from DI container');
      expect(error.code).toBe(ANALYSIS_ERROR_CODES.DI_RESOLUTION_FAILED);
      expect(error.name).toBe('DependencyInjectionError');
    });

    it('should store cause when provided', () => {
      const cause = new Error('Container not initialized');
      const error = new DependencyInjectionError('TagManager', cause);
      expect(error.cause).toBe(cause);
    });

    it('should include serviceName in context', () => {
      const error = new DependencyInjectionError('CacheService');
      expect(error.context).toEqual({ serviceName: 'CacheService' });
    });

    it('should be instance of ApplicationError', () => {
      const error = new DependencyInjectionError('Test');
      expect(error).toBeInstanceOf(ApplicationError);
    });
  });
});

// ============================================================================
// ERROR CODES
// ============================================================================

describe('Error Codes', () => {
  it('should have unique provider error codes', () => {
    const codes = Object.values(PROVIDER_ERROR_CODES);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should have unique analysis error codes', () => {
    const codes = Object.values(ANALYSIS_ERROR_CODES);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should have expected provider error code values', () => {
    expect(PROVIDER_ERROR_CODES.INITIALIZATION_FAILED).toBe('PROVIDER_INITIALIZATION_FAILED');
    expect(PROVIDER_ERROR_CODES.REQUEST_FAILED).toBe('PROVIDER_REQUEST_FAILED');
    expect(PROVIDER_ERROR_CODES.RESPONSE_INVALID).toBe('PROVIDER_RESPONSE_INVALID');
    expect(PROVIDER_ERROR_CODES.RATE_LIMITED).toBe('PROVIDER_RATE_LIMITED');
  });

  it('should have expected analysis error code values', () => {
    expect(ANALYSIS_ERROR_CODES.EMAIL_ANALYSIS_FAILED).toBe('EMAIL_ANALYSIS_FAILED');
    expect(ANALYSIS_ERROR_CODES.EMAIL_RETRIEVAL_FAILED).toBe('EMAIL_RETRIEVAL_FAILED');
    expect(ANALYSIS_ERROR_CODES.TAG_APPLICATION_FAILED).toBe('TAG_APPLICATION_FAILED');
    expect(ANALYSIS_ERROR_CODES.CACHE_ERROR).toBe('CACHE_ERROR');
    expect(ANALYSIS_ERROR_CODES.BATCH_ANALYSIS_FAILED).toBe('BATCH_ANALYSIS_FAILED');
    expect(ANALYSIS_ERROR_CODES.CONFIGURATION_ERROR).toBe('CONFIGURATION_ERROR');
    expect(ANALYSIS_ERROR_CODES.DI_RESOLUTION_FAILED).toBe('DI_RESOLUTION_FAILED');
  });
});

// ============================================================================
// ERROR CHAINING
// ============================================================================

describe('Error Chaining', () => {
  it('should support cause chain for InfrastructureError', () => {
    const rootCause = new Error('Network failure');
    const infraError = new ProviderRequestError('openai', 'analyze', rootCause);
    const appError = new EmailAnalysisError('msg-123', 'Provider failed', infraError);

    expect(appError.cause).toBe(infraError);
    expect(infraError.cause).toBe(rootCause);
  });

  it('should support cause chain for ApplicationError', () => {
    const cause = new Error('Original error');
    const error = new EmailRetrievalError('msg-123', cause);
    expect(error.cause).toBe(cause);
    expect(error.cause?.message).toBe('Original error');
  });

  it('should preserve error names through chain', () => {
    const cause = new ProviderRateLimitError('gemini', 30);
    const error = new EmailAnalysisError('msg-456', 'Rate limited', cause);

    expect(error.name).toBe('EmailAnalysisError');
    expect((error.cause as ProviderRateLimitError).name).toBe('ProviderRateLimitError');
  });
});
