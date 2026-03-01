/**
 * Tests for Handler Cleanup
 *
 * Tests proper cleanup of Thunderbird event handlers to prevent memory leaks.
 *
 * @module test/background/HandlerCleanup.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockLogger } from '../helpers/mock-factories';

// Mock the messenger global
const mockMessenger = {
  menus: {
    create: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    onClicked: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  notifications: {
    create: vi.fn(),
  },
  messages: {
    list: vi.fn(),
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
    getDisplayedMessage: vi.fn(),
  },
  runtime: {
    onInstalled: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onSuspend: {
      addListener: vi.fn(),
    },
  },
};

vi.stubGlobal('messenger', mockMessenger);

// Import handlers after mocking
import { InstallHandler } from '../../src/background/InstallHandler';
import { ContextMenuHandler } from '../../src/background/ContextMenuHandler';

// ============================================================================
// InstallHandler Cleanup Tests
// ============================================================================

describe('InstallHandler - Handler Cleanup', () => {
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

  describe('register', () => {
    it('should store handler reference when registering', () => {
      handler.register();

      expect(mockMessenger.runtime.onInstalled.addListener).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Install handler registered');
    });

    it('should pass the same handler reference to addListener', () => {
      handler.register();

      // Get the handler that was passed to addListener
      const addedHandler = mockMessenger.runtime.onInstalled.addListener.mock.calls[0][0];

      // Verify it's a function
      expect(typeof addedHandler).toBe('function');
    });
  });

  describe('unregister', () => {
    it('should remove handler reference when unregistering', () => {
      handler.register();
      handler.unregister();

      expect(mockMessenger.runtime.onInstalled.removeListener).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Install handler unregistered');
    });

    it('should pass the same handler reference to removeListener', () => {
      handler.register();

      // Get the handler that was passed to addListener
      const addedHandler = mockMessenger.runtime.onInstalled.addListener.mock.calls[0][0];

      handler.unregister();

      // Get the handler that was passed to removeListener
      const removedHandler = mockMessenger.runtime.onInstalled.removeListener.mock.calls[0][0];

      // Should be the same reference
      expect(removedHandler).toBe(addedHandler);
    });

    it('should not call removeListener if handler was not registered', () => {
      handler.unregister();

      expect(mockMessenger.runtime.onInstalled.removeListener).not.toHaveBeenCalled();
    });

    it('should not call removeListener twice after unregistering', () => {
      handler.register();
      handler.unregister();
      vi.clearAllMocks();

      handler.unregister();

      expect(mockMessenger.runtime.onInstalled.removeListener).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// ContextMenuHandler Cleanup Tests
// ============================================================================

describe('ContextMenuHandler - Handler Cleanup', () => {
  let handler: ContextMenuHandler;
  let mockLogger = createMockLogger();

  // Mock dependencies
  const mockAnalyzeEmail = {
    execute: vi.fn(),
  };

  const mockAnalyzeBatch = {
    execute: vi.fn().mockResolvedValue({ total: 0, successCount: 0, failureCount: 0 }),
  };

  const mockAppConfigService = {
    getAppConfig: vi.fn().mockResolvedValue({ defaultProvider: 'ollama' }),
    getProviderSettings: vi.fn().mockResolvedValue({ apiKey: 'test', model: 'test-model' }),
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    const mockUndoTagChanges = {
      execute: vi.fn().mockResolvedValue(true),
    };
    handler = new ContextMenuHandler(
      mockAnalyzeEmail as unknown as never,
      mockAnalyzeBatch as unknown as never,
      mockUndoTagChanges as unknown as never,
      mockAppConfigService as unknown as never,
      mockLogger
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerMenus', () => {
    it('should store click handler reference when registering', () => {
      handler.registerMenus();

      expect(mockMessenger.menus.onClicked.addListener).toHaveBeenCalled();
    });

    it('should pass the same handler reference to addListener', () => {
      handler.registerMenus();

      // Get the handler that was passed to addListener
      const addedHandler = mockMessenger.menus.onClicked.addListener.mock.calls[0][0];

      // Verify it's a function
      expect(typeof addedHandler).toBe('function');
    });
  });

  describe('unregisterMenus', () => {
    it('should remove click handler reference when unregistering', () => {
      handler.registerMenus();
      handler.unregisterMenus();

      expect(mockMessenger.menus.onClicked.removeListener).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Context menu click handler unregistered');
    });

    it('should pass the same handler reference to removeListener', () => {
      handler.registerMenus();

      // Get the handler that was passed to addListener
      const addedHandler = mockMessenger.menus.onClicked.addListener.mock.calls[0][0];

      handler.unregisterMenus();

      // Get the handler that was passed to removeListener
      const removedHandler = mockMessenger.menus.onClicked.removeListener.mock.calls[0][0];

      // Should be the same reference
      expect(removedHandler).toBe(addedHandler);
    });

    it('should remove all menu items when unregistering', () => {
      handler.registerMenus();
      handler.unregisterMenus();

      expect(mockMessenger.menus.remove).toHaveBeenCalledWith('batch-analyze-folder');
      expect(mockMessenger.menus.remove).toHaveBeenCalledWith('analyze-single-message-list');
      expect(mockMessenger.menus.remove).toHaveBeenCalledWith('analyze-single-message-display');
    });

    it('should not call removeListener if handler was not registered', () => {
      handler.unregisterMenus();

      expect(mockMessenger.menus.onClicked.removeListener).not.toHaveBeenCalled();
    });

    it('should not call removeListener twice after unregistering', () => {
      handler.registerMenus();
      handler.unregisterMenus();
      vi.clearAllMocks();

      handler.unregisterMenus();

      expect(mockMessenger.menus.onClicked.removeListener).not.toHaveBeenCalled();
    });
  });
});
