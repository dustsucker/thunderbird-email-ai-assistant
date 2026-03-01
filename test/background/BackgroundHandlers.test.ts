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
    onClicked: {
      addListener: vi.fn(),
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
    },
    onSuspend: {
      addListener: vi.fn(),
    },
  },
};

vi.stubGlobal('messenger', mockMessenger);

// Import handlers after mocking
import { ToolbarHandler } from '../../src/background/ToolbarHandler';
import { InstallHandler } from '../../src/background/InstallHandler';

// ============================================================================
// ToolbarHandler Tests
// ============================================================================

describe('ToolbarHandler', () => {
  let handler: ToolbarHandler;
  let mockLogger = createMockLogger();

  beforeEach(() => {
    mockLogger = createMockLogger();
    handler = new ToolbarHandler(mockLogger);
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
