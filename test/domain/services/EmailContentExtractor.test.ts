/**
 * Tests for EmailContentExtractor
 *
 * @module test/domain/services/EmailContentExtractor.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EmailContentExtractor } from '../../../src/domain/services/EmailContentExtractor';
import type { EmailPart } from '../../../src/shared/types/EmailPart';
import { createMockLogger } from '../../helpers/mock-factories';

// ============================================================================
// Test Fixtures
// ============================================================================

const createPlainTextPart = (body: string): EmailPart => ({
  contentType: 'text/plain',
  body,
  isAttachment: false,
});

const createHtmlPart = (body: string): EmailPart => ({
  contentType: 'text/html',
  body,
  isAttachment: false,
});

const createAttachmentPart = (
  name: string,
  mimeType: string = 'application/pdf',
  size: number = 1024
): EmailPart => ({
  contentType: mimeType,
  body: '',
  isAttachment: true,
  name,
  size,
});

const createNestedPart = (parts: EmailPart[]): EmailPart => ({
  contentType: 'multipart/mixed',
  body: '',
  isAttachment: false,
  parts,
});

// ============================================================================
// Tests
// ============================================================================

describe('EmailContentExtractor', () => {
  let extractor: EmailContentExtractor;
  let mockLogger = createMockLogger();

  beforeEach(() => {
    mockLogger = createMockLogger();
    extractor = new EmailContentExtractor(mockLogger);
  });

  // ==========================================================================
  // findEmailParts() Tests
  // ==========================================================================

  describe('findEmailParts', () => {
    it('should extract plain text body', () => {
      const parts = [createPlainTextPart('Hello world')];

      const result = extractor.findEmailParts(parts);

      expect(result.body).toBe('Hello world');
      expect(result.attachments).toEqual([]);
    });

    it('should convert HTML body to text when no plain text', () => {
      const parts = [createHtmlPart('<p>Hello <b>world</b></p>')];

      const result = extractor.findEmailParts(parts);

      expect(result.body).toContain('Hello');
      expect(result.body).toContain('world');
    });

    it('should prefer HTML over plain text (converted to text)', () => {
      const parts = [
        createPlainTextPart('Plain text content'),
        createHtmlPart('<p>HTML content</p>'),
      ];

      const result = extractor.findEmailParts(parts);

      // HTML is converted to text and takes precedence
      expect(result.body).toContain('HTML content');
    });

    it('should extract attachments', () => {
      const parts = [createPlainTextPart('Email body'), createAttachmentPart('document.pdf')];

      const result = extractor.findEmailParts(parts);

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].name).toBe('document.pdf');
      expect(result.attachments[0].mimeType).toBe('application/pdf');
    });

    it('should extract multiple attachments', () => {
      const parts = [
        createPlainTextPart('Email body'),
        createAttachmentPart('document.pdf'),
        createAttachmentPart('image.png', 'image/png', 2048),
      ];

      const result = extractor.findEmailParts(parts);

      expect(result.attachments).toHaveLength(2);
      expect(result.attachments[0].name).toBe('document.pdf');
      expect(result.attachments[1].name).toBe('image.png');
    });

    it('should handle nested parts', () => {
      const parts = [
        createNestedPart([
          createPlainTextPart('Nested content'),
          createAttachmentPart('nested-attachment.pdf'),
        ]),
      ];

      const result = extractor.findEmailParts(parts);

      expect(result.body).toBe('Nested content');
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].name).toBe('nested-attachment.pdf');
    });

    it('should handle deeply nested parts', () => {
      const parts = [
        createNestedPart([createNestedPart([createPlainTextPart('Deeply nested content')])]),
      ];

      const result = extractor.findEmailParts(parts);

      expect(result.body).toBe('Deeply nested content');
    });

    it('should handle empty parts array', () => {
      const result = extractor.findEmailParts([]);

      expect(result.body).toBe('');
      expect(result.attachments).toEqual([]);
    });

    it('should handle parts without body', () => {
      const parts: EmailPart[] = [
        {
          contentType: 'text/plain',
          body: '',
          isAttachment: false,
        },
      ];

      const result = extractor.findEmailParts(parts);

      expect(result.body).toBe('');
    });

    it('should skip attachments without name', () => {
      const parts = [
        createPlainTextPart('Body'),
        {
          contentType: 'application/pdf',
          body: '',
          isAttachment: true,
          name: undefined,
        } as EmailPart,
      ];

      const result = extractor.findEmailParts(parts);

      expect(result.attachments).toHaveLength(0);
    });

    it('should log parsing progress', () => {
      extractor.findEmailParts([createPlainTextPart('Test')]);

      expect(mockLogger.debug).toHaveBeenCalledWith('Parsing email parts...');
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle special characters in body', () => {
      const parts = [createPlainTextPart('Special chars: <>&"\'')];
      const result = extractor.findEmailParts(parts);

      expect(result.body).toBe('Special chars: <>&"\'');
    });

    it('should handle unicode in body', () => {
      const parts = [createPlainTextPart('Unicode: 你好 🎉 émojis')];
      const result = extractor.findEmailParts(parts);

      expect(result.body).toBe('Unicode: 你好 🎉 émojis');
    });

    it('should handle very large body', () => {
      const largeBody = 'x'.repeat(100000);
      const parts = [createPlainTextPart(largeBody)];
      const result = extractor.findEmailParts(parts);

      expect(result.body).toBe(largeBody);
      expect(result.body.length).toBe(100000);
    });

    it('should handle many nested levels', () => {
      const parts = [
        createNestedPart([
          createNestedPart([
            createNestedPart([createNestedPart([createPlainTextPart('Deeply nested')])]),
          ]),
        ]),
      ];

      const result = extractor.findEmailParts(parts);
      expect(result.body).toBe('Deeply nested');
    });

    it('should handle mixed content types in nested structure', () => {
      const parts = [
        createNestedPart([
          createPlainTextPart('Plain part'),
          createAttachmentPart('attachment1.pdf'),
        ]),
        createHtmlPart('<p>HTML part</p>'),
        createAttachmentPart('attachment2.png', 'image/png'),
      ];

      const result = extractor.findEmailParts(parts);

      // HTML takes precedence
      expect(result.body).toContain('HTML part');
      expect(result.attachments).toHaveLength(2);
    });
  });
});
