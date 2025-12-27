import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockProvider } from './mocks/MockProvider';
import { StructuredEmailData } from '../core/analysis';
import { DEFAULT_CUSTOM_TAGS } from '../core/config';
import {
  createTestProvider,
  runTaggingTest,
  MOCK_SETTINGS,
  expectValidResponse,
} from './test-helpers';
import { loadEmailFixture } from './fixtures/fixture-loader';

describe('E2E Email Tagging System', () => {
  let mockProvider: MockProvider;

  beforeEach(() => {
    mockProvider = createTestProvider();
  });

  afterEach(() => {
    mockProvider.reset();
  });

  describe('Happy Path - Single Tag Scenarios', () => {
    it('should parse business email and tag it as is_business', async () => {
      mockProvider.setMockResponse({
        tags: ['is_business'],
        confidence: 0.9,
        reasoning: 'Email is work-related and contains business communication about partnership.',
      });

      await runTaggingTest(mockProvider, {
        filename: 'business-email.eml',
        expectedTag: 'is_business',
        expectedConfidence: 0.9,
        reasoningSubstring: 'business',
      });

      expect(mockProvider.getRequestCount()).toBe(1);
    });

    it('should parse advertisement email and tag it as is_advertise', async () => {
      mockProvider.setMockResponse({
        tags: ['is_advertise'],
        confidence: 0.95,
        reasoning: 'Email contains promotional content with discount offers and calls to action.',
      });

      await runTaggingTest(mockProvider, {
        filename: 'advertisement-email.eml',
        expectedTag: 'is_advertise',
        expectedConfidence: 0.95,
        reasoningSubstring: 'promotional',
      });

      expect(mockProvider.getRequestCount()).toBe(1);
    });

    it('should parse personal email and tag it as is_personal', async () => {
      mockProvider.setMockResponse({
        tags: ['is_personal'],
        confidence: 0.88,
        reasoning: 'Email is a personal message from a friend sharing weekend experiences.',
      });

      await runTaggingTest(mockProvider, {
        filename: 'personal-email.eml',
        expectedTag: 'is_personal',
        expectedConfidence: 0.88,
        reasoningSubstring: 'personal',
      });

      expect(mockProvider.getRequestCount()).toBe(1);
    });
  });

  describe('Happy Path - Multiple Tags', () => {
    it('should handle multiple tags correctly', async () => {
      mockProvider.setMockResponse({
        tags: ['is_business', 'is_business_approach'],
        confidence: 0.85,
        reasoning: 'Email is a business approach from a company offering services.',
      });

      await runTaggingTest(mockProvider, {
        filename: 'business-email.eml',
        expectedTag: ['is_business', 'is_business_approach'],
        expectedConfidence: 0.85,
      });

      expect(mockProvider.getRequestCount()).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle email with empty body', async () => {
      const structuredData: StructuredEmailData = {
        headers: {
          from: 'test@example.com',
          to: 'recipient@example.com',
          subject: 'Empty Body Test',
        },
        body: '',
        attachments: [],
      };

      mockProvider.setMockResponse({
        tags: [],
        confidence: 0.5,
        reasoning: 'Email has no content to analyze.',
      });

      const result = await mockProvider.analyze({
        settings: MOCK_SETTINGS,
        structuredData,
        customTags: DEFAULT_CUSTOM_TAGS,
      });

      expectValidResponse(result);
      expect(result.tags).toEqual([]);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.reasoning).toBeDefined();
    });

    it('should validate confidence is within valid range', async () => {
      mockProvider.setMockResponse({
        tags: ['is_business'],
        confidence: 0.75,
        reasoning: 'Business email with professional tone.',
      });

      await runTaggingTest(mockProvider, {
        filename: 'business-email.eml',
        expectedTag: 'is_business',
        expectedConfidence: 0.75,
      });

      expect(mockProvider.getRequestCount()).toBe(1);
    });

    it('should include reasoning in response', async () => {
      mockProvider.setMockResponse({
        tags: ['is_business'],
        confidence: 0.8,
        reasoning: 'This is a detailed explanation of why this email was tagged.',
      });

      const result = await runTaggingTest(mockProvider, {
        filename: 'business-email.eml',
        expectedTag: 'is_business',
        expectedConfidence: 0.8,
      });

      expect(result.reasoning).toBeDefined();
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeout gracefully', async () => {
      mockProvider.setMockTimeout();

      const structuredData = await loadEmailFixture('business-email.eml');

      await expect(
        mockProvider.analyze({
          settings: MOCK_SETTINGS,
          structuredData,
          customTags: DEFAULT_CUSTOM_TAGS,
        })
      ).rejects.toThrow('Request timeout');

      expect(mockProvider.getRequestCount()).toBe(1);
    });

    it('should handle HTTP 5xx server errors', async () => {
      mockProvider.setMockErrorResponse(500);

      const structuredData = await loadEmailFixture('business-email.eml');

      const result = await mockProvider.analyze({
        settings: MOCK_SETTINGS,
        structuredData,
        customTags: DEFAULT_CUSTOM_TAGS,
      });

      expect(result).toBeDefined();
      expect(mockProvider.getRequestCount()).toBe(1);
    });

    it('should handle malformed JSON response', async () => {
      mockProvider.setMockMalformedJson();

      const structuredData = await loadEmailFixture('business-email.eml');

      await expect(
        mockProvider.analyze({
          settings: MOCK_SETTINGS,
          structuredData,
          customTags: DEFAULT_CUSTOM_TAGS,
        })
      ).rejects.toThrow('Invalid JSON');

      expect(mockProvider.getRequestCount()).toBe(1);
    });
  });

  describe('MockProvider Request Tracking', () => {
    it('should track multiple requests', async () => {
      mockProvider.setMockResponse({
        tags: ['is_business'],
        confidence: 0.9,
        reasoning: 'Test',
      });

      const structuredData = await loadEmailFixture('business-email.eml');

      await mockProvider.analyze({
        settings: MOCK_SETTINGS,
        structuredData,
        customTags: DEFAULT_CUSTOM_TAGS,
      });

      await mockProvider.analyze({
        settings: MOCK_SETTINGS,
        structuredData,
        customTags: DEFAULT_CUSTOM_TAGS,
      });

      expect(mockProvider.getRequestCount()).toBe(2);
      mockProvider.reset();
      expect(mockProvider.getRequestCount()).toBe(0);
    });
  });

  describe('Email Structure Validation', () => {
    it('should correctly parse headers from EML file', async () => {
      const structuredData = await loadEmailFixture('business-email.eml');

      expect(structuredData.headers.from).toBe('"Firma GmbH" <info@firma-gmbh.de>');
      expect(structuredData.headers.to).toBe('"Max Mustermann" <max.mustermann@email.com>');
      expect(structuredData.headers.subject).toBe('Geschäftsangebot für Zusammenarbeit');
    });

    it('should extract no attachments from simple emails', async () => {
      const structuredData = await loadEmailFixture('personal-email.eml');

      expect(structuredData.attachments).toEqual([]);
    });
  });
});
