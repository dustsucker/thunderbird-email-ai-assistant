/**
 * Thunderbird WebExtension API Type Declarations
 *
 * Minimal type definitions for the Thunderbird messenger API.
 * These are global declarations to avoid module import issues.
 *
 * @module types/thunderbird
 */

// ============================================================================
// Thunderbird Folder Types
// ============================================================================

/**
 * Thunderbird folder structure for context menus.
 */
interface ThunderbirdFolder {
  accountId: string;
  id: string;
  path: string;
  name: string;
  type: string;
}

/**
 * Folder menu click data.
 */
interface FolderMenuOnClickData {
  menuItemId: string | number;
  selectedFolders?: ThunderbirdFolder[];
  modifiers: string[];
  selectedMessages?: {
    id: number | null;
    messages: Array<{ id: number; date: string }>;
  };
}

/**
 * Tab interface for browser tabs.
 */
interface Tab {
  id: number;
  type: string;
  index?: number;
  windowId?: number;
  selected?: boolean;
}

// ============================================================================
// Messenger API Declarations
// ============================================================================

/**
 * Thunderbird messenger global object.
 */
declare const messenger: {
  messages: {
    onNewMailReceived: {
      addListener(
        callback: (folder: ThunderbirdFolder, messages: { messages: Array<{ id: number }> }) => void
      ): void;
      removeListener(
        callback: (folder: ThunderbirdFolder, messages: { messages: Array<{ id: number }> }) => void
      ): void;
    };
    getFull(messageId: number): Promise<unknown>;
    list(folderId?: string): Promise<{ messages: Array<{ id: number }> }>;
    get(messageId: number): Promise<{ id: number; tags?: string[] }>;
    update(messageId: number, properties: { tags: string[] }): Promise<void>;
  };
  messageDisplay: {
    getDisplayedMessage(tabId?: number): Promise<{ id: number } | null>;
  };
  storage: {
    local: {
      get(keys?: Record<string, unknown> | string[] | string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  runtime: {
    onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
      removeListener(callback: (details: { reason: string }) => void): void;
    };
    onSuspend: {
      addListener(callback: () => void): void;
    };
    sendMessage(message: {
      action: string;
      folderId?: string;
      messageId?: string;
    }): Promise<unknown>;
  };
  menus: {
    create(createProperties: Record<string, unknown>, callback?: () => void): void;
    remove(menuItemId: string): Promise<void>;
    onClicked: {
      addListener(callback: (info: FolderMenuOnClickData, tab: Tab) => void): void;
      removeListener(callback: (info: FolderMenuOnClickData, tab: Tab) => void): void;
    };
  };
  browserAction?: {
    onClicked?: {
      addListener(callback: (tab: Tab) => void): void;
    };
  };
  action?: {
    onClicked?: {
      addListener(callback: (tab: Tab) => void): void;
    };
  };
  notifications: {
    create(options: {
      type: string;
      iconUrl: string;
      title: string;
      message: string;
    }): Promise<string>;
  };
};

/**
 * Browser global object (for lastError checking).
 */
declare const browser: {
  runtime?: {
    lastError?: { message: string };
  };
};
