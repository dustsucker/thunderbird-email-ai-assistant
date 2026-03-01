/**
 * Tests for ExtractEmailContentUseCase
 *
 * @module test/application/use-cases/ExtractEmailContentUseCase.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExtractEmailContentUseCase } from '../../../src/application/use-cases/ExtractEmailContentUseCase';
import { EmailContentExtractor } from '../../../src/domain/services/EmailContentExtractor';
import type { IEmailMessage, IEmailPart } from '../../../src/infrastructure/interfaces/IMailReader';
import { createMockLogger } from '../../helpers/mock-factories';

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

const createMockPart = (overrides: Partial<IEmailPart> = {}): IEmailPart => ({
  contentType: 'text/plain',
  body: 'Part body',
  isAttachment: false,
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('ExtractEmailContentUseCase', () => {
  let useCase: ExtractEmailContentUseCase;
  let mockContentExtractor: EmailContentExtractor;
  let mockLogger = createMockLogger();

  beforeEach(() => {
    mockContentExtractor = {
      findEmailParts: vi.fn(),
      buildPrompt: vi.fn(),
      truncateText: vi.fn((text, max) => text.substring(0, max)),
    } as unknown as EmailContentExtractor;

    mockLogger = createMockLogger();

    useCase = new ExtractEmailContentUseCase(mockContentExtractor, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      expect(useCase).toBeInstanceOf(ExtractEmailContentUseCase);
      expect(mockLogger.debug).toHaveBeenCalledWith('✅ ExtractEmailContentUseCase initialized');
    });
  });

  // ==========================================================================
  // execute() Tests
  // ==========================================================================

  describe('execute', () => {
    it('should extract content from email with simple body', async () => {
      const email = createMockEmail({ body: 'Simple plain text body' });

      const result = await useCase.execute(email);

      expect(result.body).toBe('Simple plain text body');
      expect(result.attachments).toEqual([]);
      expect(result.headers).toEqual({ 'message-id': '<test123@example.com>' });
    });

    it('should extract content from email with parts', async () => {
      const email = createMockEmail({
        body: '',
        parts: [createMockPart({ contentType: 'text/plain', body: 'Body from part' })],
      });

      vi.mocked(mockContentExtractor.findEmailParts).mockReturnValue({
        body: 'Body from part',
        attachments: [],
      });

      const result = await useCase.execute(email);

      expect(result.body).toBe('Body from part');
      expect(mockContentExtractor.findEmailParts).toHaveBeenCalledWith(email.parts);
    });

    it('should extract attachments from email parts', async () => {
      const email = createMockEmail({
        body: 'Main body',
        parts: [
          createMockPart({ contentType: 'text/plain', body: 'Body' }),
          createMockPart({
            contentType: 'application/pdf',
            body: '',
            isAttachment: true,
            name: 'document.pdf',
            size: 1024,
          }),
        ],
      });

      vi.mocked(mockContentExtractor.findEmailParts).mockReturnValue({
        body: 'Body',
        attachments: [{ name: 'document.pdf', mimeType: 'application/pdf', size: 1024 }],
      });

      const result = await useCase.execute(email);

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0]).toEqual({
        name: 'document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      });
    });

    it('should extract direct attachments from email', async () => {
      const email = createMockEmail({
        body: 'Main body',
        attachments: [
          { name: 'image.png', mimeType: 'image/png', size: 2048 },
          { name: 'report.xlsx', mimeType: 'application/vnd.ms-excel', size: 4096 },
        ],
      });

      const result = await useCase.execute(email);

      expect(result.attachments).toHaveLength(2);
      expect(result.attachments[0].name).toBe('image.png');
      expect(result.attachments[1].name).toBe('report.xlsx');
    });

    it('should merge attachments from parts and direct attachments', async () => {
      const email = createMockEmail({
        body: 'Main body',
        parts: [
          createMockPart({
            contentType: 'application/pdf',
            body: '',
            isAttachment: true,
            name: 'part-document.pdf',
            size: 1024,
          }),
        ],
        attachments: [{ name: 'direct-image.png', mimeType: 'image/png', size: 2048 }],
      });

      vi.mocked(mockContentExtractor.findEmailParts).mockReturnValue({
        body: 'Body',
        attachments: [{ name: 'part-document.pdf', mimeType: 'application/pdf', size: 1024 }],
      });

      const result = await useCase.execute(email);

      expect(result.attachments).toHaveLength(2);
    });

    it('should deduplicate attachments by name', async () => {
      const email = createMockEmail({
        body: 'Main body',
        parts: [
          createMockPart({
            contentType: 'application/pdf',
            body: '',
            isAttachment: true,
            name: 'duplicate.pdf',
            size: 1024,
          }),
        ],
        attachments: [{ name: 'duplicate.pdf', mimeType: 'application/pdf', size: 2048 }],
      });

      vi.mocked(mockContentExtractor.findEmailParts).mockReturnValue({
        body: 'Body',
        attachments: [{ name: 'duplicate.pdf', mimeType: 'application/pdf', size: 1024 }],
      });

      const result = await useCase.execute(email);

      // Should not duplicate attachments with same name
      expect(result.attachments).toHaveLength(1);
    });

    it('should extract headers from email', async () => {
      const email = createMockEmail({
        headers: {
          'message-id': '<msg123@example.com>',
          from: 'sender@example.com',
          to: 'recipient@example.com',
          subject: 'Test Subject',
        },
      });

      const result = await useCase.execute(email);

      expect(result.headers).toEqual({
        'message-id': '<msg123@example.com>',
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
      });
    });

    it('should log debug messages during extraction', async () => {
      const email = createMockEmail({ id: 456 });

      await useCase.execute(email);

      expect(mockLogger.debug).toHaveBeenCalledWith('📄 Extracting email content', {
        messageId: 456,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith('✅ Email content extracted', {
        bodyLength: expect.any(Number),
        attachmentsCount: 0,
      });
    });

    it('should log when processing email parts', async () => {
      const email = createMockEmail({
        parts: [createMockPart({ contentType: 'text/plain', body: 'Body' })],
      });

      vi.mocked(mockContentExtractor.findEmailParts).mockReturnValue({
        body: 'Body',
        attachments: [],
      });

      await useCase.execute(email);

      expect(mockLogger.debug).toHaveBeenCalledWith('📎 Processing email parts', {
        partCount: 1,
      });
    });

    it('should log when processing direct attachments', async () => {
      const email = createMockEmail({
        attachments: [{ name: 'file.pdf', mimeType: 'application/pdf', size: 1024 }],
      });

      await useCase.execute(email);

      expect(mockLogger.debug).toHaveBeenCalledWith('📎 Processing direct attachments', {
        attachmentCount: 1,
      });
    });

    it('should handle errors gracefully', async () => {
      const email = createMockEmail();
      const error = new Error('Extraction failed');
      vi.mocked(mockContentExtractor.findEmailParts).mockImplementation(() => {
        throw error;
      });

      // Add parts to trigger findEmailParts call
      email.parts = [createMockPart()];

      await expect(useCase.execute(email)).rejects.toThrow('Extraction failed');

      expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to extract email content', {
        messageId: email.id,
        error: 'Extraction failed',
      });
    });

    it('should handle non-Error thrown values', async () => {
      const email = createMockEmail({ parts: [createMockPart()] });
      vi.mocked(mockContentExtractor.findEmailParts).mockImplementation(() => {
        throw 'String error';
      });

      await expect(useCase.execute(email)).rejects.toThrow('String error');

      expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to extract email content', {
        messageId: email.id,
        error: 'String error',
      });
    });

    it('should handle email with no body or parts', async () => {
      const email = createMockEmail({ body: undefined });

      const result = await useCase.execute(email);

      expect(result.body).toBe('');
    });

    it('should handle empty email parts array', async () => {
      const email = createMockEmail({ parts: [] });

      const result = await useCase.execute(email);

      expect(result.body).toBe('Test body content');
    });

    it('should handle empty attachments array', async () => {
      const email = createMockEmail({ attachments: [] });

      const result = await useCase.execute(email);

      expect(result.attachments).toEqual([]);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle email with nested parts', async () => {
      const email = createMockEmail({
        parts: [
          createMockPart({
            contentType: 'multipart/mixed',
            body: '',
            parts: [createMockPart({ contentType: 'text/plain', body: 'Nested body' })],
          }),
        ],
      });

      vi.mocked(mockContentExtractor.findEmailParts).mockReturnValue({
        body: 'Nested body',
        attachments: [],
      });

      const result = await useCase.execute(email);

      expect(result.body).toBe('Nested body');
    });

    it('should handle email with large body', async () => {
      const largeBody = 'x'.repeat(100000);
      const email = createMockEmail({ body: largeBody });

      const result = await useCase.execute(email);

      expect(result.body).toBe(largeBody);
      expect(result.body.length).toBe(100000);
    });

    it('should handle email with special characters in body', async () => {
      const specialBody = 'Body with émojis 🎉 and spëcial châractérs';
      const email = createMockEmail({ body: specialBody });

      const result = await useCase.execute(email);

      expect(result.body).toBe(specialBody);
    });

    it('should handle email with missing optional fields', async () => {
      const email: IEmailMessage = {
        id: 123,
        headers: {},
        attachments: [],
      };

      const result = await useCase.execute(email);

      expect(result.body).toBe('');
      expect(result.attachments).toEqual([]);
      expect(result.headers).toEqual({});
    });
  });
});
