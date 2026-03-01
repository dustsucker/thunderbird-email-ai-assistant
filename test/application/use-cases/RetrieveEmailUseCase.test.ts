/**
 * Tests for RetrieveEmailUseCase
 *
 * @module test/application/use-cases/RetrieveEmailUseCase.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetrieveEmailUseCase } from '../../../src/application/use-cases/RetrieveEmailUseCase';
import type {
  IMailReader,
  IEmailMessage,
} from '../../../src/infrastructure/interfaces/IMailReader';
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

// ============================================================================
// Tests
// ============================================================================

describe('RetrieveEmailUseCase', () => {
  let useCase: RetrieveEmailUseCase;
  let mockMailReader: IMailReader;
  let mockLogger = createMockLogger();

  beforeEach(() => {
    mockMailReader = {
      getFullMessage: vi.fn(),
      getMessageHeaders: vi.fn(),
      getRawMessage: vi.fn(),
      parseMessageParts: vi.fn(),
      getPlainTextBody: vi.fn(),
      getHTMLTextBody: vi.fn(),
      getAttachments: vi.fn(),
      getAttachmentContent: vi.fn(),
      getMessages: vi.fn(),
      queryMessages: vi.fn(),
      parseEMLFile: vi.fn(),
    };

    mockLogger = createMockLogger();

    useCase = new RetrieveEmailUseCase(mockMailReader, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      expect(useCase).toBeInstanceOf(RetrieveEmailUseCase);
      expect(mockLogger.debug).toHaveBeenCalledWith('✅ RetrieveEmailUseCase initialized');
    });
  });

  // ==========================================================================
  // execute() Tests
  // ==========================================================================

  describe('execute', () => {
    it('should retrieve email by string ID', async () => {
      const mockEmail = createMockEmail();
      vi.mocked(mockMailReader.getFullMessage).mockResolvedValue(mockEmail);

      const result = await useCase.execute('123');

      expect(result.email).toEqual(mockEmail);
      expect(result.messageIdNum).toBe(123);
      expect(mockMailReader.getFullMessage).toHaveBeenCalledWith(123);
    });

    it('should throw error for invalid message ID (NaN)', async () => {
      await expect(useCase.execute('invalid')).rejects.toThrow('Invalid message ID: invalid');
    });

    it('should throw error for empty string message ID', async () => {
      await expect(useCase.execute('')).rejects.toThrow('Invalid message ID:');
    });

    it('should throw error if email not found (null result)', async () => {
      vi.mocked(mockMailReader.getFullMessage).mockResolvedValue(null as unknown as IEmailMessage);

      await expect(useCase.execute('999')).rejects.toThrow('Email not found: 999');
    });

    it('should log debug messages on successful retrieval', async () => {
      const mockEmail = createMockEmail({ subject: 'Important Email' });
      vi.mocked(mockMailReader.getFullMessage).mockResolvedValue(mockEmail);

      await useCase.execute('123');

      expect(mockLogger.debug).toHaveBeenCalledWith('📬 Retrieving email from Thunderbird', {
        messageId: '123',
      });
      expect(mockLogger.debug).toHaveBeenCalledWith('✅ Email retrieved successfully', {
        messageId: '123',
        subject: 'Important Email',
        from: 'sender@example.com',
      });
    });

    it('should handle Thunderbird API errors', async () => {
      const apiError = new Error('Thunderbird API error');
      vi.mocked(mockMailReader.getFullMessage).mockRejectedValue(apiError);

      await expect(useCase.execute('123')).rejects.toThrow('Thunderbird API error');

      expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to retrieve email', {
        messageId: '123',
        error: 'Thunderbird API error',
      });
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(mockMailReader.getFullMessage).mockRejectedValue('String error');

      await expect(useCase.execute('123')).rejects.toThrow('String error');

      expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to retrieve email', {
        messageId: '123',
        error: 'String error',
      });
    });

    it('should parse numeric string IDs correctly', async () => {
      const mockEmail = createMockEmail({ id: 456 });
      vi.mocked(mockMailReader.getFullMessage).mockResolvedValue(mockEmail);

      const result = await useCase.execute('456');

      expect(result.messageIdNum).toBe(456);
      expect(mockMailReader.getFullMessage).toHaveBeenCalledWith(456);
    });

    it('should handle large numeric IDs', async () => {
      const largeId = 9999999999;
      const mockEmail = createMockEmail({ id: largeId });
      vi.mocked(mockMailReader.getFullMessage).mockResolvedValue(mockEmail);

      const result = await useCase.execute(String(largeId));

      expect(result.messageIdNum).toBe(largeId);
    });

    it('should handle negative numeric IDs', async () => {
      const mockEmail = createMockEmail({ id: -1 });
      vi.mocked(mockMailReader.getFullMessage).mockResolvedValue(mockEmail);

      const result = await useCase.execute('-1');

      expect(result.messageIdNum).toBe(-1);
    });
  });

  // ==========================================================================
  // Result Type Tests
  // ==========================================================================

  describe('RetrieveEmailResult', () => {
    it('should return correct result structure', async () => {
      const mockEmail = createMockEmail({
        id: 789,
        subject: 'Complex Email',
        from: 'complex@example.com',
        to: ['recipient1@example.com', 'recipient2@example.com'],
        cc: ['cc@example.com'],
        body: 'Complex body with multiple recipients',
        headers: {
          'message-id': '<complex789@example.com>',
          'x-priority': '1',
        },
        attachments: [{ name: 'file.pdf', mimeType: 'application/pdf', size: 1024 }],
      });
      vi.mocked(mockMailReader.getFullMessage).mockResolvedValue(mockEmail);

      const result = await useCase.execute('789');

      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('messageIdNum');
      expect(result.email).toEqual(mockEmail);
      expect(result.messageIdNum).toBe(789);
    });
  });
});
