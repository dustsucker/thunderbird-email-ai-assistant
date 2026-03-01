/**
 * Tests for EmailContentExtractor
 *
 * @module test/domain/services/EmailContentExtractor.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailContentExtractor } from '../../../src/domain/services/EmailContentExtractor';
import type { EmailPart, StructuredEmailData } from '../../../src/shared/types/EmailPart';
import type { CustomTags } from '../../../src/shared/types/ProviderTypes';
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

const createCustomTags = (): CustomTags => [
  { key: 'business', name: 'Business', color: '#FF0000', prompt: 'Is this a business email?' },
  { key: 'personal', name: 'Personal', color: '#00FF00', prompt: 'Is this a personal email?' },
];

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
  // buildPrompt() Tests
  // ==========================================================================

  describe('buildPrompt', () => {
    const promptTemplate =
      'Analyze this email:\nHeaders: {headers}\nBody: {body}\nAttachments: {attachments}';

    it('should build prompt with structured data', () => {
      const structuredData: StructuredEmailData = {
        headers: { from: 'test@example.com', subject: 'Test' },
        body: 'Email body content',
        attachments: [],
      };
      const customTags = createCustomTags();

      const result = extractor.buildPrompt(structuredData, customTags, promptTemplate);

      expect(result.prompt).toContain('Email body content');
      expect(result.prompt).toContain('test@example.com');
    });

    it('should include custom tag prompts', () => {
      const structuredData: StructuredEmailData = {
        headers: {},
        body: 'Body',
        attachments: [],
      };
      const customTags = createCustomTags();

      const result = extractor.buildPrompt(structuredData, customTags, promptTemplate);

      expect(result.allTagsDescription).toContain(
        '- business: (boolean) Is this a business email?'
      );
      expect(result.allTagsDescription).toContain(
        '- personal: (boolean) Is this a personal email?'
      );
    });

    it('should replace headers placeholder', () => {
      const structuredData: StructuredEmailData = {
        headers: { from: 'sender@example.com', to: 'recipient@example.com' },
        body: 'Body',
        attachments: [],
      };
      const customTags: CustomTags = [];

      const result = extractor.buildPrompt(structuredData, customTags, promptTemplate);

      expect(result.prompt).toContain('sender@example.com');
      expect(result.prompt).toContain('recipient@example.com');
    });

    it('should replace body placeholder', () => {
      const structuredData: StructuredEmailData = {
        headers: {},
        body: 'This is the email body',
        attachments: [],
      };
      const customTags: CustomTags = [];

      const result = extractor.buildPrompt(structuredData, customTags, promptTemplate);

      expect(result.prompt).toContain('This is the email body');
    });

    it('should replace attachments placeholder', () => {
      const structuredData: StructuredEmailData = {
        headers: {},
        body: 'Body',
        attachments: [{ name: 'file.pdf', mimeType: 'application/pdf', size: 1024 }],
      };
      const customTags: CustomTags = [];

      const result = extractor.buildPrompt(structuredData, customTags, promptTemplate);

      expect(result.prompt).toContain('file.pdf');
      expect(result.prompt).toContain('application/pdf');
    });

    it('should handle empty custom tags', () => {
      const structuredData: StructuredEmailData = {
        headers: {},
        body: 'Body',
        attachments: [],
      };
      const customTags: CustomTags = [];

      const result = extractor.buildPrompt(structuredData, customTags, promptTemplate);

      expect(result.allTagsDescription).toBe('');
    });

    it('should handle empty structured data', () => {
      const structuredData: StructuredEmailData = {
        headers: {},
        body: '',
        attachments: [],
      };
      const customTags: CustomTags = [];

      const result = extractor.buildPrompt(structuredData, customTags, promptTemplate);

      expect(result.prompt).toBeDefined();
    });
  });

  // ==========================================================================
  // truncateText() Tests
  // ==========================================================================

  describe('truncateText', () => {
    it('should truncate text to max length', () => {
      const text = 'This is a long text that should be truncated';
      const result = extractor.truncateText(text, 20);

      expect(result.length).toBe(20);
      expect(result).toBe('This is a long text ');
    });

    it('should return original text if shorter than max', () => {
      const text = 'Short text';
      const result = extractor.truncateText(text, 100);

      expect(result).toBe(text);
    });

    it('should return original text if exactly max length', () => {
      const text = 'Exactly 19 chars'; // Exactly 19 characters
      const result = extractor.truncateText(text, 19);

      expect(result).toBe(text);
    });

    it('should handle empty string', () => {
      const result = extractor.truncateText('', 10);

      expect(result).toBe('');
    });

    it('should handle zero max length', () => {
      const text = 'Some text';
      const result = extractor.truncateText(text, 0);

      expect(result).toBe('');
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
