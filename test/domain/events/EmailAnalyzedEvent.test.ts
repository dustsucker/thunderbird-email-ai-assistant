/**
 * Tests for EmailAnalyzedEvent
 *
 * @module test/domain/events/EmailAnalyzedEvent.test
 */

import { describe, it, expect } from 'vitest';
import {
  EmailAnalyzedEvent,
  createEmailAnalyzedEvent,
} from '../../../src/domain/events/EmailAnalyzedEvent';
import type { ITagResponse } from '../../../src/infrastructure/interfaces/IProvider';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockTagResponse = (overrides: Partial<ITagResponse> = {}): ITagResponse => ({
  tags: ['business', 'important'],
  confidence: 0.85,
  reasoning: 'This looks like a business email',
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('EmailAnalyzedEvent', () => {
  // ==========================================================================
  // Type Tests
  // ==========================================================================

  describe('type definition', () => {
    it('should have correct eventType', () => {
      const event: EmailAnalyzedEvent = {
        eventType: 'EmailAnalyzed',
        timestamp: new Date().toISOString(),
        messageId: '123',
        providerId: 'openai',
        model: 'gpt-4',
        result: createMockTagResponse(),
        fromCache: false,
      };

      expect(event.eventType).toBe('EmailAnalyzed');
    });

    it('should have all required fields', () => {
      const event: EmailAnalyzedEvent = {
        eventType: 'EmailAnalyzed',
        timestamp: new Date().toISOString(),
        messageId: '123',
        providerId: 'openai',
        model: 'gpt-4',
        result: createMockTagResponse(),
        fromCache: false,
      };

      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('messageId');
      expect(event).toHaveProperty('providerId');
      expect(event).toHaveProperty('model');
      expect(event).toHaveProperty('result');
      expect(event).toHaveProperty('fromCache');
    });

    it('should have optional fields', () => {
      const event: EmailAnalyzedEvent = {
        eventType: 'EmailAnalyzed',
        timestamp: new Date().toISOString(),
        messageId: '123',
        providerId: 'openai',
        model: 'gpt-4',
        result: createMockTagResponse(),
        fromCache: true,
        cacheKey: 'abc123',
        duration: 1500,
      };

      expect(event.cacheKey).toBe('abc123');
      expect(event.duration).toBe(1500);
    });
  });

  // ==========================================================================
  // createEmailAnalyzedEvent() Tests
  // ==========================================================================

  describe('createEmailAnalyzedEvent', () => {
    it('should create event with required fields', () => {
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result);

      expect(event.eventType).toBe('EmailAnalyzed');
      expect(event.messageId).toBe('123');
      expect(event.providerId).toBe('openai');
      expect(event.model).toBe('gpt-4');
      expect(event.result).toEqual(result);
    });

    it('should set fromCache to false by default', () => {
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result);

      expect(event.fromCache).toBe(false);
    });

    it('should set fromCache when provided in options', () => {
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result, {
        fromCache: true,
      });

      expect(event.fromCache).toBe(true);
    });

    it('should include cacheKey when provided', () => {
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result, {
        cacheKey: 'test-cache-key',
      });

      expect(event.cacheKey).toBe('test-cache-key');
    });

    it('should include duration when provided', () => {
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result, {
        duration: 2500,
      });

      expect(event.duration).toBe(2500);
    });

    it('should include all options when provided', () => {
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result, {
        fromCache: true,
        cacheKey: 'test-cache-key',
        duration: 1000,
      });

      expect(event.fromCache).toBe(true);
      expect(event.cacheKey).toBe('test-cache-key');
      expect(event.duration).toBe(1000);
    });

    it('should generate valid ISO timestamp', () => {
      const result = createMockTagResponse();
      const beforeTime = new Date().toISOString();
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result);
      const afterTime = new Date().toISOString();

      expect(event.timestamp >= beforeTime).toBe(true);
      expect(event.timestamp <= afterTime).toBe(true);
    });

    it('should handle different providers', () => {
      const providers = ['openai', 'gemini', 'claude', 'ollama', 'mistral'];

      providers.forEach((provider) => {
        const result = createMockTagResponse();
        const event = createEmailAnalyzedEvent('123', provider, 'model', result);

        expect(event.providerId).toBe(provider);
      });
    });

    it('should handle different models', () => {
      const models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'gemini-pro'];

      models.forEach((model) => {
        const result = createMockTagResponse();
        const event = createEmailAnalyzedEvent('123', 'openai', model, result);

        expect(event.model).toBe(model);
      });
    });

    it('should handle different result types', () => {
      // High confidence
      const highConfidenceResult = createMockTagResponse({ confidence: 0.95 });
      const highEvent = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', highConfidenceResult);
      expect(highEvent.result.confidence).toBe(0.95);

      // Low confidence
      const lowConfidenceResult = createMockTagResponse({ confidence: 0.45 });
      const lowEvent = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', lowConfidenceResult);
      expect(lowEvent.result.confidence).toBe(0.45);

      // Many tags
      const manyTagsResult = createMockTagResponse({
        tags: ['business', 'important', 'urgent', 'follow-up'],
      });
      const manyTagsEvent = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', manyTagsResult);
      expect(manyTagsEvent.result.tags).toHaveLength(4);

      // No tags
      const noTagsResult = createMockTagResponse({ tags: [] });
      const noTagsEvent = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', noTagsResult);
      expect(noTagsEvent.result.tags).toHaveLength(0);
    });

    it('should preserve all result properties', () => {
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result);

      // Event properties should match the input
      expect(event.messageId).toBe('123');
      expect(event.providerId).toBe('openai');
      expect(event.model).toBe('gpt-4');
      expect(event.result).toEqual(result);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty string message ID', () => {
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent('', 'openai', 'gpt-4', result);

      expect(event.messageId).toBe('');
    });

    it('should handle long message IDs', () => {
      const longId = 'a'.repeat(1000);
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent(longId, 'openai', 'gpt-4', result);

      expect(event.messageId).toBe(longId);
    });

    it('should handle special characters in reasoning', () => {
      const specialReasoning = 'Email contains émojis 🎉 and spëcial châractérs';
      const result = createMockTagResponse({ reasoning: specialReasoning });
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result);

      expect(event.result.reasoning).toBe(specialReasoning);
    });

    it('should handle zero duration', () => {
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result, {
        duration: 0,
      });

      expect(event.duration).toBe(0);
    });

    it('should handle empty options object', () => {
      const result = createMockTagResponse();
      const event = createEmailAnalyzedEvent('123', 'openai', 'gpt-4', result, {});

      expect(event.fromCache).toBe(false);
      expect(event.cacheKey).toBeUndefined();
      expect(event.duration).toBeUndefined();
    });
  });
});
