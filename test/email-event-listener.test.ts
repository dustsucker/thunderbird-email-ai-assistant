import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailEventListener } from '@/interfaces/background/EmailEventListener';
import type { IMailReader } from '@/infrastructure/interfaces/IMailReader';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import { AnalyzeEmail } from '@/application/use-cases/AnalyzeEmail';
import { AnalyzeBatchEmails } from '@/application/use-cases/AnalyzeBatchEmails';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';
import { EventBus } from '@/domain/events/EventBus';

declare global {
  var messenger: any;
}

describe('EmailEventListener - Logging Tests', () => {
  let logger: ILogger;
  let queue: IQueue;
  let analyzeEmail: AnalyzeEmail;
  let analyzeBatch: AnalyzeBatchEmails;
  let eventBus: EventBus;
  let emailEventListener: EmailEventListener;
  let mockMessenger: any;

  const mockFolder = {
    accountId: 1,
    name: 'INBOX',
    type: 'inbox',
    path: '/INBOX',
  };

  const mockMessages = {
    messages: [{ id: 123 }, { id: 456 }],
  };

  const mockQueueStats = {
    size: 5,
    waiting: 2,
    processing: 3,
    avgWaitTime: 100,
  };

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      maskApiKey: vi.fn((key) => key),
    };

    queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue(null),
      clear: vi.fn(),
      getStats: vi.fn().mockResolvedValue(mockQueueStats),
      peek: vi.fn(),
      size: vi.fn(),
      isEmpty: vi.fn(),
    };

    analyzeEmail = {
      execute: vi.fn().mockResolvedValue({
        tags: ['work'],
        confidence: 0.9,
        reasoning: 'Test reasoning',
      }),
    } as unknown as AnalyzeEmail;

    analyzeBatch = {
      execute: vi.fn().mockResolvedValue({
        total: 2,
        successCount: 2,
        failureCount: 0,
        results: [
          { messageId: '123', success: true, tags: ['work'] },
          { messageId: '456', success: true, tags: ['personal'] },
        ],
        cancelled: false,
      }),
      isRunning: vi.fn().mockResolvedValue(false),
      getProgress: vi.fn().mockResolvedValue({
        total: 2,
        processed: 2,
        failed: 0,
        percentage: 100,
        isRunning: false,
        isCancelled: false,
        processedMessageIds: ['123', '456'],
        failedMessageIds: [],
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
    } as unknown as AnalyzeBatchEmails;

    eventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as EventBus;

    emailEventListener = new EmailEventListener(
      {} as IMailReader,
      analyzeEmail,
      analyzeBatch,
      logger,
      eventBus
    );

    mockMessenger = {
      messages: {
        onNewMailReceived: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        getFull: vi.fn().mockResolvedValue({
          id: 123,
          subject: 'Test Subject',
          author: 'test@example.com',
          recipients: [{ email: 'recipient@example.com' }],
        }),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            provider: 'openai',
            apiKey: 'test-key',
            model: 'gpt-4',
          }),
        },
      },
    };

    global.messenger = mockMessenger;
  });

  afterEach(() => {
    delete (global as any).messenger;
  });

  describe('New mail event received logging', () => {
    it('should log "New mail event received" with correct context', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(logger.info).toHaveBeenCalledWith('New mail event received', {
        messageCount: mockMessages.messages.length,
        folderName: mockFolder.name,
        folderPath: mockFolder.path,
        folderType: mockFolder.type,
      });
    });

    it('should include messageCount in log context', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(logger.info).toHaveBeenCalledWith(
        'New mail event received',
        expect.objectContaining({
          messageCount: 2,
        })
      );
    });

    it('should include folder details in log context', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(logger.info).toHaveBeenCalledWith('New mail event received', {
        messageCount: 2,
        folderName: 'INBOX',
        folderPath: '/INBOX',
        folderType: 'inbox',
      });
    });

    it('should log as first info message in handler', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      const infoCall = logger.info as ReturnType<typeof vi.fn>;
      expect(infoCall).toHaveBeenNthCalledWith(1, 'New mail event received', expect.any(Object));
    });
  });

  describe('Queue status logging', () => {
    it('should call logQueueStatus after new mail event log', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(queue.getStats).toHaveBeenCalled();
    });

    it('should log queue status with correct fields', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(logger.info).toHaveBeenCalledWith(
        'Queue status',
        expect.objectContaining({
          size: mockQueueStats.size,
          waiting: mockQueueStats.waiting,
          processing: mockQueueStats.processing,
          avgWaitTime: mockQueueStats.avgWaitTime,
        })
      );
    });

    it('should log queue status after "New mail event received"', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      const infoCall = logger.info as ReturnType<typeof vi.fn>;
      expect(infoCall).toHaveBeenNthCalledWith(1, 'New mail event received', expect.any(Object));
      expect(infoCall).toHaveBeenNthCalledWith(2, 'Queue status', expect.any(Object));
    });

    it('should handle different queue stats correctly', async () => {
      const customStats = {
        size: 10,
        waiting: 7,
        processing: 3,
        avgWaitTime: 250,
      };

      (queue.getStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce(customStats);

      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(logger.info).toHaveBeenCalledWith(
        'Queue status',
        expect.objectContaining({
          size: customStats.size,
          waiting: customStats.waiting,
          processing: customStats.processing,
          avgWaitTime: customStats.avgWaitTime,
        })
      );
    });
  });

  describe('New email processing logging', () => {
    it('should log "New email received" after queue status', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      const infoCall = logger.info as ReturnType<typeof vi.fn>;

      expect(infoCall).toHaveBeenNthCalledWith(1, 'New mail event received', expect.any(Object));
      expect(infoCall).toHaveBeenNthCalledWith(2, 'Queue status', expect.any(Object));
      expect(infoCall).toHaveBeenNthCalledWith(
        3,
        'New email received',
        expect.objectContaining({
          folder: 'INBOX',
          messageCount: 2,
        })
      );
    });

    it('should include folder and messageCount in log context', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(logger.info).toHaveBeenCalledWith('New email received', {
        folder: mockFolder.name,
        messageCount: mockMessages.messages.length,
      });
    });

    it('should log "New mail processing completed" after batch analysis', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(logger.info).toHaveBeenCalledWith('New mail processing completed', {
        total: 2,
        successCount: 2,
        failureCount: 0,
      });
    });
  });

  describe('Complete logging flow for new mail event', () => {
    it('should log all messages in correct order', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      const infoCall = logger.info as ReturnType<typeof vi.fn>;

      expect(infoCall).toHaveBeenNthCalledWith(1, 'New mail event received', {
        messageCount: 2,
        folderName: 'INBOX',
        folderPath: '/INBOX',
        folderType: 'inbox',
      });

      expect(infoCall).toHaveBeenNthCalledWith(
        2,
        'Queue status',
        expect.objectContaining({
          size: 5,
          waiting: 2,
          processing: 3,
          avgWaitTime: 100,
        })
      );

      expect(infoCall).toHaveBeenNthCalledWith(3, 'New email received', {
        folder: 'INBOX',
        messageCount: 2,
      });

      expect(infoCall).toHaveBeenNthCalledWith(4, 'New mail processing completed', {
        total: 2,
        successCount: 2,
        failureCount: 0,
      });
    });

    it('should include all required context fields', async () => {
      const handler = emailEventListener as any;
      await handler.onNewMailReceived(mockFolder, mockMessages);

      expect(logger.info).toHaveBeenNthCalledWith(
        1,
        'New mail event received',
        expect.objectContaining({
          messageCount: expect.any(Number),
          folderName: expect.any(String),
          folderPath: expect.any(String),
          folderType: expect.any(String),
        })
      );

      expect(logger.info).toHaveBeenNthCalledWith(
        2,
        'Queue status',
        expect.objectContaining({
          size: expect.any(Number),
          waiting: expect.any(Number),
          processing: expect.any(Number),
          avgWaitTime: expect.any(Number),
        })
      );

      expect(logger.info).toHaveBeenNthCalledWith(
        3,
        'New email received',
        expect.objectContaining({
          folder: expect.any(String),
          messageCount: expect.any(Number),
        })
      );

      expect(logger.info).toHaveBeenNthCalledWith(
        4,
        'New mail processing completed',
        expect.objectContaining({
          total: expect.any(Number),
          successCount: expect.any(Number),
          failureCount: expect.any(Number),
        })
      );
    });
  });

  describe('Listener registration logging', () => {
    it('should log when registering listeners', () => {
      emailEventListener.registerListeners();

      expect(logger.info).toHaveBeenCalledWith('Registering email event listeners');
      expect(logger.info).toHaveBeenCalledWith('New mail event listener registered');
    });

    it('should log when unregistering listeners', () => {
      emailEventListener.registerListeners();
      emailEventListener.unregisterListeners();

      expect(logger.info).toHaveBeenCalledWith('Unregistering email event listeners');
      expect(logger.info).toHaveBeenCalledWith('New mail event listener unregistered');
    });

    it('should log when starting listener service', () => {
      emailEventListener.start();

      expect(logger.info).toHaveBeenCalledWith('Starting email event listener service');
      expect(logger.info).toHaveBeenCalledWith('Registering email event listeners');
    });

    it('should log when stopping listener service', () => {
      emailEventListener.registerListeners();
      emailEventListener.stop();

      expect(logger.info).toHaveBeenCalledWith('Stopping email event listener service');
      expect(logger.info).toHaveBeenCalledWith('Unregistering email event listeners');
    });

    it('should warn if listeners already registered', () => {
      emailEventListener.registerListeners();
      emailEventListener.registerListeners();

      expect(logger.warn).toHaveBeenCalledWith('Event listeners already registered');
    });
  });
});
