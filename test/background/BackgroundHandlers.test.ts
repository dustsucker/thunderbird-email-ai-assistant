/**
 * Tests for Background Handlers
 *
 * @module test/background/BackgroundHandlers.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockLogger } from '../helpers/mock-factories';

// Mock the messenger global
const mockMessenger = {
  menus: {
    create: vi.fn(),
    removeAll: undefined as unknown as (() => Promise<void>) | undefined,
    onClicked: {
      addListener: vi.fn(),
    },
  },
  notifications: {
    create: vi.fn(),
  },
  messages: {
    list: vi.fn(),
    continueList: vi.fn(),
    get: vi.fn(),
    getFull: vi.fn(),
    addTags: vi.fn(),
    removeTags: vi.fn(),
    update: vi.fn(),
    listTags: vi.fn(),
    tags: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  browserAction: {
    onClicked: {
      addListener: vi.fn(),
    },
  },
  action: {
    onClicked: {
      addListener: vi.fn(),
    },
  },
  messageDisplay: {
    getDisplayedMessages: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
    },
  },
  runtime: {
    onInstalled: {
      addListener: vi.fn(),
    },
    onSuspend: {
      addListener: vi.fn(),
    },
  },
};

vi.stubGlobal('messenger', mockMessenger);

// Import handlers after mocking
import { ToolbarHandler } from '../../src/background/ToolbarHandler';
import { ContextMenuHandler } from '../../src/background/ContextMenuHandler';
import { InstallHandler } from '../../src/background/InstallHandler';

// ============================================================================
// ToolbarHandler Tests
// ============================================================================

describe('ToolbarHandler', () => {
  let handler: ToolbarHandler;
  let mockLogger = createMockLogger();

  beforeEach(() => {
    mockLogger = createMockLogger();
    handler = new ToolbarHandler(mockLogger, {} as never, {} as never);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(handler).toBeInstanceOf(ToolbarHandler);
    });
  });

  describe('register', () => {
    it('should register click handler with browserAction', () => {
      mockMessenger.browserAction = {
        onClicked: { addListener: vi.fn() },
      };

      handler.register();

      expect(mockMessenger.browserAction.onClicked.addListener).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Toolbar button registered successfully');
    });

    it('should use action API if browserAction not available', () => {
      mockMessenger.browserAction = undefined as unknown as typeof mockMessenger.browserAction;

      handler.register();

      expect(mockMessenger.action.onClicked.addListener).toHaveBeenCalled();
    });

    it('should log warning if neither API available', () => {
      mockMessenger.browserAction = undefined as unknown as typeof mockMessenger.browserAction;
      mockMessenger.action = undefined as unknown as typeof mockMessenger.action;

      handler.register();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Browser action API not available for toolbar button'
      );
    });
  });

  describe('handleToolbarClick (via registered listener)', () => {
    const tab = { id: 7, type: 'messageDisplay' };

    function getClickListener(): (tab: { id: number; type: string }) => Promise<void> {
      const addListener = vi.fn();
      mockMessenger.browserAction = { onClicked: { addListener } };
      handler.register();
      return addListener.mock.calls[0][0];
    }

    it('should notify and do nothing when no messages are displayed (empty list)', async () => {
      const clickListener = getClickListener();
      // MV3 shape since TB 128: getDisplayedMessages resolves to a MessageList object
      mockMessenger.messageDisplay.getDisplayedMessages.mockResolvedValueOnce({
        id: 'mock-list',
        messages: [],
      });

      await clickListener(tab);

      expect(mockMessenger.messageDisplay.getDisplayedMessages).toHaveBeenCalledWith(tab.id);
      expect(mockMessenger.notifications.create).toHaveBeenCalledTimes(1);
      expect(mockMessenger.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Keine Nachricht' })
      );
    });

    it('should start analysis for the first displayed message', async () => {
      handler = new ToolbarHandler(
        mockLogger,
        {
          execute: vi
            .fn()
            .mockResolvedValue({ tags: ['rechnung'], confidence: 0.9, messageId: '42' }),
        } as never,
        {
          getAppConfig: vi.fn().mockResolvedValue({ defaultProvider: 'openai' }),
          getProviderSettings: vi.fn().mockResolvedValue({ apiKey: 'k', model: 'm' }),
        } as never
      );
      const clickListener = getClickListener();
      // MV3 shape since TB 128: getDisplayedMessages resolves to a MessageList object
      mockMessenger.messageDisplay.getDisplayedMessages.mockResolvedValueOnce({
        id: 'mock-list',
        messages: [{ id: 42 }],
      });

      await clickListener(tab);

      // Start notification must not leak the raw internal messageId
      expect(mockMessenger.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Analyse gestartet',
          message: 'Die Analyse wurde gestartet.',
        })
      );
      // Completion notification reports the awarded tags
      expect(mockMessenger.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Analyse abgeschlossen',
          message: expect.stringContaining('rechnung'),
        })
      );
    });

    it('should not throw when getDisplayedMessages rejects', async () => {
      const clickListener = getClickListener();
      mockMessenger.messageDisplay.getDisplayedMessages.mockRejectedValueOnce(
        new Error('API gone')
      );

      await expect(clickListener(tab)).resolves.toBeUndefined();
      // The handler is the outermost layer: it logs the failure at error level itself
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should not notify when enableNotifications is false', async () => {
      mockMessenger.storage.local.get.mockReset().mockResolvedValue({
        appConfig: { enableNotifications: false },
      });
      const clickListener = getClickListener();
      // MV3 MessageList shape since TB 128
      mockMessenger.messageDisplay.getDisplayedMessages.mockResolvedValueOnce({
        id: 'mock-list',
        messages: [],
      });

      await clickListener(tab);

      expect(mockMessenger.storage.local.get).toHaveBeenCalledWith({
        appConfig: { enableNotifications: true },
      });
      expect(mockMessenger.notifications.create).not.toHaveBeenCalled();
    });

    it('should notify by default when the flag is absent', async () => {
      mockMessenger.storage.local.get.mockReset().mockResolvedValue({});
      const clickListener = getClickListener();
      // MV3 MessageList shape since TB 128
      mockMessenger.messageDisplay.getDisplayedMessages.mockResolvedValueOnce({
        id: 'mock-list',
        messages: [],
      });

      await clickListener(tab);

      expect(mockMessenger.notifications.create).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// ContextMenuHandler Tests
// ============================================================================

describe('ContextMenuHandler', () => {
  function createHandlerWithMocks() {
    const analyzeBatch = {
      execute: vi.fn().mockResolvedValue({ total: 0, successCount: 0, failureCount: 0 }),
    };
    const handler = new ContextMenuHandler(
      { execute: vi.fn() } as never,
      analyzeBatch as never,
      { execute: vi.fn() } as never,
      {
        getAppConfig: vi.fn().mockResolvedValue({ defaultProvider: 'ollama' }),
        getProviderSettings: vi.fn().mockResolvedValue({ apiKey: '', model: 'llama3' }),
      } as never,
      createMockLogger()
    );
    return { handler, analyzeBatch };
  }

  function getMenuClickListener(handler: ContextMenuHandler) {
    const addListener = vi.fn();
    mockMessenger.menus.onClicked.addListener.mockImplementation(addListener);
    handler.registerMenus();
    return addListener.mock.calls[0][0];
  }

  beforeEach(() => {
    mockMessenger.menus.create.mockReset();
    mockMessenger.menus.onClicked.addListener.mockReset();
    mockMessenger.notifications.create.mockReset().mockResolvedValue('notif-id');
    mockMessenger.messages.list.mockReset();
    mockMessenger.messages.continueList.mockReset();
  });

  it('should create menus with only valid Thunderbird contexts', () => {
    const { handler } = createHandlerWithMocks();
    handler.registerMenus();

    const contexts = mockMessenger.menus.create.mock.calls.map(
      (call) => (call[0] as { contexts: string[] }).contexts
    );
    const valid = new Set([
      'all',
      'page',
      'frame',
      'selection',
      'link',
      'editable',
      'image',
      'audio',
      'video',
      'password',
      'browser_action',
      'message_display_action_menu',
      'compose_action',
      'tools_menu',
      'tab',
      'message_list',
      'folder_pane',
    ]);
    const all = contexts.flat();
    expect(all.length).toBeGreaterThan(0);
    for (const context of all) {
      expect(valid.has(context)).toBe(true);
    }
    // The folder batch entry must use folder_pane (not the invalid 'folder')
    expect(contexts.some((c) => c.includes('folder_pane'))).toBe(true);
    expect(all).not.toContain('folder');
  });

  it('should process ALL messages across paginated folder listing (2 pages)', async () => {
    const { handler, analyzeBatch } = createHandlerWithMocks();
    const clickListener = getMenuClickListener(handler);

    // Page 1: two messages, continuation token present; page 2: one message, exhausted
    mockMessenger.messages.list.mockResolvedValueOnce({
      id: 'list-1',
      messages: [{ id: 1 }, { id: 2 }],
    });
    mockMessenger.messages.continueList.mockResolvedValueOnce({
      id: null,
      messages: [{ id: 3 }],
    });

    await clickListener(
      {
        menuItemId: 'batch-analyze-folder',
        modifiers: [],
        selectedFolders: [
          { accountId: 'acc1', id: 'folder-1', path: 'INBOX', name: 'Inbox', type: 'inbox' },
        ],
      },
      { id: 1, type: 'messageDisplay' }
    );

    expect(mockMessenger.messages.continueList).toHaveBeenCalledWith('list-1');
    expect(analyzeBatch.execute).toHaveBeenCalledTimes(1);
    expect(analyzeBatch.execute).toHaveBeenCalledWith(
      ['1', '2', '3'],
      expect.objectContaining({ providerSettings: expect.objectContaining({ provider: 'ollama' }) })
    );
  });

  it('should not call continueList when the first page is the last page', async () => {
    const { handler, analyzeBatch } = createHandlerWithMocks();
    const clickListener = getMenuClickListener(handler);

    mockMessenger.messages.list.mockResolvedValueOnce({ id: null, messages: [{ id: 9 }] });

    await clickListener(
      {
        menuItemId: 'batch-analyze-folder',
        modifiers: [],
        selectedFolders: [
          { accountId: 'acc1', id: 'folder-1', path: 'INBOX', name: 'Inbox', type: 'inbox' },
        ],
      },
      { id: 1, type: 'messageDisplay' }
    );

    expect(mockMessenger.messages.continueList).not.toHaveBeenCalled();
    expect(analyzeBatch.execute).toHaveBeenCalledWith(['9'], expect.anything());
  });

  it('should not notify when enableNotifications is false', async () => {
    mockMessenger.storage.local.get.mockReset().mockResolvedValue({
      appConfig: { enableNotifications: false },
    });
    const { handler } = createHandlerWithMocks();
    const clickListener = getMenuClickListener(handler);
    mockMessenger.messages.list.mockResolvedValueOnce({ id: null, messages: [] });

    await clickListener(
      {
        menuItemId: 'batch-analyze-folder',
        modifiers: [],
        selectedFolders: [
          { accountId: 'acc1', id: 'folder-1', path: 'INBOX', name: 'Inbox', type: 'inbox' },
        ],
      },
      { id: 1, type: 'messageDisplay' }
    );

    expect(mockMessenger.storage.local.get).toHaveBeenCalledWith({
      appConfig: { enableNotifications: true },
    });
    expect(mockMessenger.notifications.create).not.toHaveBeenCalled();
  });

  it('should notify by default when the flag is absent', async () => {
    mockMessenger.storage.local.get.mockReset().mockResolvedValue({});
    const { handler } = createHandlerWithMocks();
    const clickListener = getMenuClickListener(handler);
    mockMessenger.messages.list.mockResolvedValueOnce({ id: null, messages: [] });

    await clickListener(
      {
        menuItemId: 'batch-analyze-folder',
        modifiers: [],
        selectedFolders: [
          { accountId: 'acc1', id: 'folder-1', path: 'INBOX', name: 'Inbox', type: 'inbox' },
        ],
      },
      { id: 1, type: 'messageDisplay' }
    );

    // Batch flow notifies twice: 'Batch-Analysis gestartet' + empty-folder notice
    expect(mockMessenger.notifications.create).toHaveBeenCalledTimes(2);
    expect(mockMessenger.notifications.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Keine Nachrichten' })
    );
  });

  // ==========================================================================
  // DW-D2: removeAll-before-create re-registration
  // ==========================================================================

  describe('DW-D2: re-registration after event-page wake', () => {
    it('awaits menus.removeAll() before the first menus.create', async () => {
      // Deferred removeAll that resolves only when we trigger it
      let resolveRemoveAll: () => void;
      const removeAllPromise = new Promise<void>((resolve) => {
        resolveRemoveAll = resolve;
      });
      const removeAll = vi.fn().mockReturnValue(removeAllPromise);
      mockMessenger.menus.removeAll = removeAll as never;

      const { handler } = createHandlerWithMocks();
      const pending = handler.registerMenus();

      // Give the microtask queue a spin — create must NOT have run yet
      await Promise.resolve();
      await Promise.resolve();
      expect(removeAll).toHaveBeenCalledTimes(1);
      expect(mockMessenger.menus.create).not.toHaveBeenCalled();

      resolveRemoveAll!();
      await pending;

      expect(mockMessenger.menus.create).toHaveBeenCalledTimes(4);

      mockMessenger.menus.removeAll = undefined;
    });

    it('logs the real lastError text when creation fails', async () => {
      // No removeAll in mock → registration path is synchronous-safe
      const logger = createMockLogger();
      const analyzeBatch = { execute: vi.fn() };
      const handler = new ContextMenuHandler(
        { execute: vi.fn() } as never,
        analyzeBatch as never,
        { execute: vi.fn() } as never,
        {} as never,
        logger
      );

      // Simulate runtime.lastError set during creation callback
      (globalThis as unknown as Record<string, unknown>).browser = {
        runtime: { lastError: { message: 'Duplicate ID batch-analyze-folder' } },
      };

      handler.registerMenus();
      // Invoke the first create callback
      const createCb = mockMessenger.menus.create.mock.calls[0][1] as () => void;
      createCb();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to create Folder context menu',
        expect.objectContaining({ error: 'Duplicate ID batch-analyze-folder' })
      );

      delete (globalThis as unknown as Record<string, unknown>).browser;
    });
  });
});

// ============================================================================
// InstallHandler Tests
// ============================================================================

describe('InstallHandler', () => {
  let handler: InstallHandler;
  let mockLogger = createMockLogger();

  beforeEach(() => {
    mockLogger = createMockLogger();
    handler = new InstallHandler(mockLogger);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(handler).toBeInstanceOf(InstallHandler);
    });
  });

  describe('register', () => {
    it('should register onInstalled handler', () => {
      handler.register();

      expect(mockMessenger.runtime.onInstalled.addListener).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Install handler registered');
    });

    it('should log warning if onInstalled not available', () => {
      mockMessenger.runtime.onInstalled =
        undefined as unknown as typeof mockMessenger.runtime.onInstalled;

      handler.register();

      expect(mockLogger.warn).toHaveBeenCalledWith('Runtime onInstalled handler not available');
    });
  });
});
