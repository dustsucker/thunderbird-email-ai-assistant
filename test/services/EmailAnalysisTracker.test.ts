/**
 * Unit tests for EmailAnalysisTracker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailAnalysisTracker } from '@/application/services/EmailAnalysisTracker';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';

// ============================================================================
// Mock Browser API
// ============================================================================

interface MockFullMessage {
  id: number;
  headers: Record<string, string[]>;
  parts: unknown[];
}

interface MockModifyPermanent {
  modifyPermanent(messageId: number, newProperties: {
    headers?: Record<string, string>;
  }): Promise<void>;
}

interface MockMessenger {
  messages: {
    getFull(messageId: number): Promise<MockFullMessage>;
  } & Partial<MockModifyPermanent>;
  storage: {
    local: {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
}

function createMockMessenger(): MockMessenger {
  const storage = new Map<string, unknown>();

  return {
    messages: {
      getFull: vi.fn(),
      modifyPermanent: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[] | null) => {
          const result: Record<string, unknown> = {};

          if (keys === null || typeof keys === 'string') {
            const key = keys === null ? Array.from(storage.keys())[0] : keys;
            if (key && storage.has(key)) {
              result[key] = storage.get(key);
            }
          } else if (Array.isArray(keys)) {
            for (const key of keys) {
              if (storage.has(key)) {
                result[key] = storage.get(key);
              }
            }
          }

          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) {
            storage.set(key, value);
          }
        }),
      },
    },
  };
}

function mockGlobalMessengerApi(messenger: MockMessenger): void {
  (globalThis as unknown as Record<string, unknown>).browser = {
    messenger,
  };
}

function cleanupGlobalMessengerApi(): void {
  delete (globalThis as unknown as Record<string, unknown>).browser;
  delete (globalThis as unknown as Record<string, unknown>).chrome;
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    maskApiKey: vi.fn((key?: string) =>
      key ? `${key.slice(0, 7)}...${key.slice(-3)}` : 'not set'
    ),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('EmailAnalysisTracker', () => {
  let tracker: EmailAnalysisTracker;
  let mockLogger: ILogger;
  let mockMessenger: MockMessenger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockMessenger = createMockMessenger();
    mockGlobalMessengerApi(mockMessenger);
    tracker = new EmailAnalysisTracker(mockLogger);
  });

  afterEach(() => {
    cleanupGlobalMessengerApi();
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('Constructor', () => {
    it('should initialize with logger', () => {
      expect(tracker).toBeInstanceOf(EmailAnalysisTracker);
      expect(mockLogger.debug).toHaveBeenCalledWith('✅ EmailAnalysisTracker service initialized');
    });
  });

  // ============================================================================
  // wasAnalyzed() Tests
  // ============================================================================

  describe('wasAnalyzed', () => {
    it('should return true when X-AI-Analyzed header is set to "true"', async () => {
      const messageId = 12345;
      const mockFullMessage: MockFullMessage = {
        id: messageId,
        headers: {
          'X-AI-Analyzed': ['true'],
        },
        parts: [],
      };

      (mockMessenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue(mockFullMessage);

      const result = await tracker.wasAnalyzed(messageId);

      expect(result).toBe(true);
      expect(mockMessenger.messages.getFull).toHaveBeenCalledWith(messageId);
      expect(mockLogger.debug).toHaveBeenCalledWith('🔍 Checking if email was analyzed', { messageId });
    });

    it('should return false when X-AI-Analyzed header is missing', async () => {
      const messageId = 67890;
      const mockFullMessage: MockFullMessage = {
        id: messageId,
        headers: {},
        parts: [],
      };

      (mockMessenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue(mockFullMessage);

      const result = await tracker.wasAnalyzed(messageId);

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Analysis status check complete',
        expect.objectContaining({
          messageId,
          hasAnalyzedHeader: false,
          headerPresent: false,
        })
      );
    });

    it('should return false when X-AI-Analyzed header has different value', async () => {
      const messageId = 11111;
      const mockFullMessage: MockFullMessage = {
        id: messageId,
        headers: {
          'X-AI-Analyzed': ['false'],
        },
        parts: [],
      };

      (mockMessenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue(mockFullMessage);

      const result = await tracker.wasAnalyzed(messageId);

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Analysis status check complete',
        expect.objectContaining({
          messageId,
          hasAnalyzedHeader: false,
          headerPresent: true,
        })
      );
    });

    it('should return false when X-AI-Analyzed header is empty array', async () => {
      const messageId = 22222;
      const mockFullMessage: MockFullMessage = {
        id: messageId,
        headers: {
          'X-AI-Analyzed': [],
        },
        parts: [],
      };

      (mockMessenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue(mockFullMessage);

      const result = await tracker.wasAnalyzed(messageId);

      expect(result).toBe(false);
    });

    it('should throw error when messenger API is not available', async () => {
      cleanupGlobalMessengerApi();

      const messageId = 33333;

      await expect(tracker.wasAnalyzed(messageId)).rejects.toThrow(
        'Failed to check analysis status for message 33333: messenger API not available'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ Failed to check analysis status',
        expect.objectContaining({
          messageId,
          error: 'messenger API not available',
        })
      );
    });

    it('should throw error when getFull fails', async () => {
      const messageId = 44444;
      const errorMessage = 'Network error';

      (mockMessenger.messages.getFull as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error(errorMessage)
      );

      await expect(tracker.wasAnalyzed(messageId)).rejects.toThrow(
        `Failed to check analysis status for message ${messageId}: ${errorMessage}`
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ Failed to check analysis status',
        expect.objectContaining({
          messageId,
          error: errorMessage,
        })
      );
    });
  });

  // ============================================================================
  // markAnalyzed() Tests - Header Write Success
  // ============================================================================

  describe('markAnalyzed - Header Write', () => {
    it('should mark email as analyzed via modifyPermanent API', async () => {
      const messageId = 55555;

      (mockMessenger.messages.modifyPermanent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await tracker.markAnalyzed(messageId);

      expect(mockMessenger.messages.modifyPermanent).toHaveBeenCalledWith(messageId, {
        headers: {
          'X-AI-Analyzed': 'true',
        },
      });

      expect(mockLogger.info).toHaveBeenCalledWith('✅ Email marked as analyzed via header', {
        messageId,
      });

      // Should not write to fallback storage
      expect(mockMessenger.storage.local.set).not.toHaveBeenCalled();
    });

    it('should accept optional config parameter', async () => {
      const messageId = 66666;
      const config = { useFallback: true };

      (mockMessenger.messages.modifyPermanent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await tracker.markAnalyzed(messageId, config);

      expect(mockMessenger.messages.modifyPermanent).toHaveBeenCalledWith(messageId, {
        headers: {
          'X-AI-Analyzed': 'true',
        },
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('🏷️  Marking email as analyzed', {
        messageId,
        config,
      });
    });

    it('should log debug message when starting to mark', async () => {
      const messageId = 77777;

      (mockMessenger.messages.modifyPermanent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await tracker.markAnalyzed(messageId);

      expect(mockLogger.debug).toHaveBeenCalledWith('🏷️  Marking email as analyzed', {
        messageId,
        config: {},
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Attempting to write analysis header', {
        messageId,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Analysis header written successfully', {
        messageId,
      });
    });
  });

  // ============================================================================
  // markAnalyzed() Tests - Fallback to Storage
  // ============================================================================

  describe('markAnalyzed - Fallback Storage', () => {
    it('should fallback to storage.local when modifyPermanent is not available', async () => {
      const messageId = 88888;

      // Simulate modifyPermanent not being available
      mockMessenger.messages.modifyPermanent = undefined;

      await tracker.markAnalyzed(messageId);

      expect(mockMessenger.storage.local.set).toHaveBeenCalledWith({
        processed_88888: 'true',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Email marked as analyzed via fallback storage',
        { messageId }
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Header write failed, using fallback storage',
        { messageId }
      );
    });

    it('should fallback to storage.local when modifyPermanent throws error', async () => {
      const messageId = 99999;

      (mockMessenger.messages.modifyPermanent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('API not supported')
      );

      await tracker.markAnalyzed(messageId);

      expect(mockMessenger.storage.local.set).toHaveBeenCalledWith({
        processed_99999: 'true',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Email marked as analyzed via fallback storage',
        { messageId }
      );

      expect(mockLogger.debug).toHaveBeenCalledWith('Failed to write analysis header', {
        messageId,
        error: 'API not supported',
      });
    });

    it('should use correct storage key pattern', async () => {
      const messageId = 123456;

      mockMessenger.messages.modifyPermanent = undefined;

      await tracker.markAnalyzed(messageId);

      expect(mockMessenger.storage.local.set).toHaveBeenCalledWith({
        processed_123456: 'true',
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Writing to fallback storage', {
        messageId,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Fallback storage write successful', {
        messageId,
        storageKey: 'processed_123456',
      });
    });
  });

  // ============================================================================
  // markAnalyzed() Tests - Error Handling
  // ============================================================================

  describe('markAnalyzed - Error Handling', () => {
    it('should throw error when messenger API is not available', async () => {
      cleanupGlobalMessengerApi();

      const messageId = 234567;

      await expect(tracker.markAnalyzed(messageId)).rejects.toThrow(
        'Failed to mark email 234567 as analyzed: messenger API not available'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ Failed to mark email as analyzed',
        expect.objectContaining({
          messageId,
          error: 'messenger API not available',
        })
      );
    });

    it('should throw error when fallback storage write fails', async () => {
      const messageId = 345678;
      const errorMessage = 'Storage quota exceeded';

      // modifyPermanent is not available
      mockMessenger.messages.modifyPermanent = undefined;

      // Fallback storage fails
      (mockMessenger.storage.local.set as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error(errorMessage)
      );

      await expect(tracker.markAnalyzed(messageId)).rejects.toThrow(
        `Failed to mark email ${messageId} as analyzed: Failed to write to fallback storage: ${errorMessage}`
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to write to fallback storage',
        expect.objectContaining({
          messageId,
          error: errorMessage,
        })
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ Failed to mark email as analyzed',
        expect.objectContaining({
          messageId,
          error: expect.stringContaining('Failed to write to fallback storage'),
        })
      );
    });

    it('should log error when both header write and fallback fail', async () => {
      const messageId = 456789;
      const errorMessage = 'Write permission denied';

      mockMessenger.messages.modifyPermanent = undefined;
      (mockMessenger.storage.local.set as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error(errorMessage)
      );

      try {
        await tracker.markAnalyzed(messageId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(mockLogger.error).toHaveBeenCalledWith(
          '❌ Failed to mark email as analyzed',
          expect.objectContaining({
            messageId,
          })
        );
      }
    });
  });

  // ============================================================================
  // Browser API Compatibility Tests
  // ============================================================================

  describe('Browser API Compatibility', () => {
    it('should work with browser.messenger API', async () => {
      const messageId = 567890;

      (mockMessenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: messageId,
        headers: { 'X-AI-Analyzed': ['true'] },
        parts: [],
      });

      const result = await tracker.wasAnalyzed(messageId);

      expect(result).toBe(true);
    });

    it('should work with chrome.messenger API', async () => {
      const messageId = 678901;

      // Remove browser API and add chrome API
      cleanupGlobalMessengerApi();
      (globalThis as unknown as Record<string, unknown>).chrome = {
        messenger: mockMessenger,
      };

      const chromeTracker = new EmailAnalysisTracker(mockLogger);

      (mockMessenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: messageId,
        headers: { 'X-AI-Analyzed': ['true'] },
        parts: [],
      });

      const result = await chromeTracker.wasAnalyzed(messageId);

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Scenarios', () => {
    it('should complete full check and mark cycle with header', async () => {
      const messageId = 789012;

      // Initially not analyzed
      (mockMessenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: messageId,
        headers: {},
        parts: [],
      });

      const wasAnalyzed = await tracker.wasAnalyzed(messageId);
      expect(wasAnalyzed).toBe(false);

      // Mark as analyzed
      (mockMessenger.messages.modifyPermanent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await tracker.markAnalyzed(messageId);

      expect(mockMessenger.messages.modifyPermanent).toHaveBeenCalledWith(messageId, {
        headers: { 'X-AI-Analyzed': 'true' },
      });
    });

    it('should complete full check and mark cycle with fallback storage', async () => {
      const messageId = 890123;

      // Initially not analyzed
      (mockMessenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: messageId,
        headers: {},
        parts: [],
      });

      const wasAnalyzed = await tracker.wasAnalyzed(messageId);
      expect(wasAnalyzed).toBe(false);

      // Mark as analyzed (modifyPermanent not available)
      mockMessenger.messages.modifyPermanent = undefined;
      await tracker.markAnalyzed(messageId);

      expect(mockMessenger.storage.local.set).toHaveBeenCalledWith({
        processed_890123: 'true',
      });
    });
  });

  // ============================================================================
  // Logging Tests
  // ============================================================================

  describe('Logging Behavior', () => {
    it('should log all debug messages during wasAnalyzed', async () => {
      const messageId = 901234;

      (mockMessenger.messages.getFull as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: messageId,
        headers: { 'X-AI-Analyzed': ['true'] },
        parts: [],
      });

      await tracker.wasAnalyzed(messageId);

      expect(mockLogger.debug).toHaveBeenCalledWith('🔍 Checking if email was analyzed', {
        messageId,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Analysis status check complete',
        expect.objectContaining({
          messageId,
          hasAnalyzedHeader: true,
          headerPresent: true,
        })
      );
    });

    it('should log success message when marking via header', async () => {
      const messageId = 912345;

      (mockMessenger.messages.modifyPermanent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await tracker.markAnalyzed(messageId);

      expect(mockLogger.info).toHaveBeenCalledWith('✅ Email marked as analyzed via header', {
        messageId,
      });
    });

    it('should log fallback message when using storage', async () => {
      const messageId = 123456;

      mockMessenger.messages.modifyPermanent = undefined;

      await tracker.markAnalyzed(messageId);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Header write failed, using fallback storage',
        { messageId }
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Email marked as analyzed via fallback storage',
        { messageId }
      );
    });
  });
});
