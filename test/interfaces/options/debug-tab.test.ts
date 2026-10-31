/**
 * Debug Tab Tests
 *
 * Tests the Debug tab component:
 * - Polling starts on activation and stops on deactivation (fake timers)
 * - Level filter hides non-matching levels (default hides debug)
 * - Log entries render newest-first
 * - Download creates an object URL and triggers the download
 * - Clear button calls clearDebugLogs
 * - Transport errors show 'Verbindung...' without crashing
 *
 * @module test/interfaces/options/debug-tab
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'reflect-metadata';
import { DebugTab } from '@/interfaces/options/DebugTab';
// Live entry (webpack 'options' → options-bundle.js): exports the real
// tab wiring that drives the module-level DebugTab instance.
import { initializeTabs } from '../../../options';

// ============================================================================
// Test Fixtures
// ============================================================================

/** Mirrors the debug tab markup in options.html (binding test). */
const DEBUG_TAB_MARKUP = `
<div id="debug" class="tab-content">
  <section class="debug-section">
    <div class="results-header-actions">
      <h2>Verarbeitungs-Queue</h2>
      <div class="debug-queue-header-actions">
        <span id="debug-connection-status" class="debug-connection-status"></span>
        <button type="button" id="debug-cancel-batch-btn" class="btn-danger" disabled>
          Verarbeitung abbrechen
        </button>
      </div>
    </div>
    <div class="debug-queue-panel">
      <div class="debug-queue-header">
        <span id="debug-batch-status-badge" class="status-badge debug-batch-idle">Inaktiv</span>
        <span id="debug-last-run" class="debug-last-run" hidden></span>
      </div>
      <div class="debug-progress-wrap">
        <progress id="debug-batch-progress" max="100" value="0"></progress>
        <span id="debug-batch-progress-text"></span>
      </div>
      <div class="debug-stats-grid">
        <div class="debug-stat"><span id="debug-stat-processed" class="debug-stat-value">0</span><span class="debug-stat-label">Verarbeitet</span></div>
        <div class="debug-stat"><span id="debug-stat-failed" class="debug-stat-value">0</span><span class="debug-stat-label">Fehlgeschlagen</span></div>
        <div class="debug-stat"><span id="debug-stat-total" class="debug-stat-value">0</span><span class="debug-stat-label">Gesamt</span></div>
        <div class="debug-stat"><span id="debug-stat-waiting" class="debug-stat-value">0</span><span class="debug-stat-label">Wartend</span></div>
        <div class="debug-stat"><span id="debug-stat-processing" class="debug-stat-value">0</span><span class="debug-stat-label">In Verarbeitung</span></div>
        <div class="debug-stat"><span id="debug-stat-avg-wait" class="debug-stat-value">0 ms</span><span class="debug-stat-label">Ø Wartezeit</span></div>
      </div>
      <span id="debug-cancel-status" class="status-message"></span>
      <p id="debug-queue-empty" class="debug-empty">Keine Verarbeitung aktiv</p>
    </div>
  </section>
  <section class="debug-section">
    <div class="results-header-actions">
      <h2>Protokoll</h2>
      <div class="debug-log-actions">
        <button type="button" id="debug-download-log-btn" class="btn-secondary">Protokoll herunterladen (.txt)</button>
        <button type="button" id="debug-clear-log-btn" class="btn-secondary">Protokoll leeren</button>
      </div>
    </div>
    <div class="debug-log-toolbar">
      <div class="filter-group">
        <label for="debug-log-filter">Level-Filter:</label>
        <select id="debug-log-filter">
          <option value="all">Alle</option>
          <option value="debug">Debug</option>
          <option value="info" selected>Info (und höher)</option>
          <option value="warn">Warnung (und höher)</option>
          <option value="error">Nur Fehler</option>
        </select>
      </div>
      <span id="debug-dropped-count" class="help-text"></span>
    </div>
    <div id="debug-log-list" class="debug-log-list"></div>
    <p id="debug-log-empty" class="debug-empty">Keine Einträge</p>
  </section>
</div>
`;

const BASE_TIME = new Date('2026-08-23T14:32:05.123').getTime();

/** Two seconds apart: entry A (older) -> entry C (newest). */
const LOG_ENTRIES = [
  { ts: BASE_TIME + 2000, level: 'error' as const, msg: 'Analyse fehlgeschlagen', ctx: '{"id":3}' },
  { ts: BASE_TIME + 1000, level: 'warn' as const, msg: 'Rate-Limit erreicht', ctx: '{"id":2}' },
  { ts: BASE_TIME + 500, level: 'info' as const, msg: 'Analyse gestartet', ctx: '{"id":1}' },
  { ts: BASE_TIME, level: 'debug' as const, msg: 'Queue-Größe geprüft' },
];

const QUEUE_STATS_RESPONSE = {
  success: true,
  queue: { size: 4, waiting: 3, processing: 1, avgWaitTime: 1250.7 },
  batch: {
    status: 'running' as const,
    total: 10,
    processed: 4,
    failed: 1,
    percentage: 40,
    isRunning: true,
  },
};

// ============================================================================
// Mock Setup
// ============================================================================

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  maskApiKey: vi.fn((key: string) => key),
};

/** Callback-style browser.runtime.sendMessage mock; routes by action. */
const sendMessageMock = vi.fn();

function installBrowserMock(): void {
  sendMessageMock.mockReset();
  sendMessageMock.mockImplementation((message: { action: string }, callback: (r: unknown) => void) => {
    switch (message.action) {
      case 'getQueueStats':
        callback(QUEUE_STATS_RESPONSE);
        break;
      case 'getDebugLogs':
        callback({ success: true, entries: LOG_ENTRIES, droppedCount: 0 });
        break;
      case 'clearDebugLogs':
        callback({ success: true });
        break;
      case 'cancelBatchAnalysis':
        callback({ success: true, message: 'Abgebrochen' });
        break;
      default:
        callback({ success: false });
    }
  });

  (window as any).browser = {
    runtime: {
      sendMessage: sendMessageMock,
      lastError: undefined,
    },
  };
}

function createDebugTab(): DebugTab {
  const tab = new DebugTab(mockLogger as any);
  tab.render();
  return tab;
}

/** Advances fake time and flushes pending microtasks. */
async function flush(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

// ============================================================================
// Tests
// ============================================================================

describe('DebugTab', () => {
  let debugTab: DebugTab;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  document.body.innerHTML = DEBUG_TAB_MARKUP;
  // happy-dom ignores the `selected` attribute and defaults to the first
  // option; browsers honor it. Normalize to the production default.
  (document.getElementById('debug-log-filter') as HTMLSelectElement).value = 'info';
  installBrowserMock();
  debugTab = createDebugTab();
});

  afterEach(() => {
    debugTab.onTabVisibilityChanged(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Polling lifecycle
  // --------------------------------------------------------------------------

  describe('polling lifecycle', () => {
    it('starts polling on activation (immediate tick + 1s interval)', async () => {
      debugTab.onTabVisibilityChanged(true);
      await flush(0);

      // Immediate tick: one request per action
      const actions = sendMessageMock.mock.calls.map((call) => (call[0] as any).action);
      expect(actions).toContain('getQueueStats');
      expect(actions).toContain('getDebugLogs');
      expect(sendMessageMock).toHaveBeenCalledTimes(2);

      // Interval keeps polling
      await flush(1000);
      expect(sendMessageMock).toHaveBeenCalledTimes(4);
      await flush(1000);
      expect(sendMessageMock).toHaveBeenCalledTimes(6);
    });

    it('stops polling on deactivation (tab switch away)', async () => {
      debugTab.onTabVisibilityChanged(true);
      await flush(0);
      expect(sendMessageMock).toHaveBeenCalledTimes(2);

      debugTab.onTabVisibilityChanged(false);
      await flush(3000);
      expect(sendMessageMock).toHaveBeenCalledTimes(2); // no further calls
    });

    it('renders queue stats from the response', async () => {
      debugTab.onTabVisibilityChanged(true);
      await flush(0);

      expect(document.getElementById('debug-batch-status-badge')?.textContent).toBe('Läuft');
      expect(
        (document.getElementById('debug-batch-progress') as HTMLProgressElement).value
      ).toBe(40);
      expect(document.getElementById('debug-stat-processed')?.textContent).toBe('4');
      expect(document.getElementById('debug-stat-failed')?.textContent).toBe('1');
      expect(document.getElementById('debug-stat-total')?.textContent).toBe('10');
      expect(document.getElementById('debug-stat-waiting')?.textContent).toBe('3');
      expect(document.getElementById('debug-stat-processing')?.textContent).toBe('1');
      expect(document.getElementById('debug-stat-avg-wait')?.textContent).toBe('1251 ms');
      expect(
        (document.getElementById('debug-cancel-batch-btn') as HTMLButtonElement).disabled
      ).toBe(false);
      // While running: empty note hidden, last-run marker hidden
      expect((document.getElementById('debug-queue-empty') as HTMLElement).style.display).toBe(
        'none'
      );
      expect((document.getElementById('debug-last-run') as HTMLElement).hidden).toBe(true);
    });

    it('renders the idle state with last-run counters and marker', async () => {
      sendMessageMock.mockImplementation(
        (message: { action: string }, callback: (r: unknown) => void) => {
          if (message.action === 'getQueueStats') {
            callback({
              success: true,
              queue: { size: 0, waiting: 0, processing: 0, avgWaitTime: 0 },
              batch: {
                status: 'idle',
                total: 6,
                processed: 5,
                failed: 1,
                percentage: 100,
                isRunning: false,
                lastRunCompletedAt: BASE_TIME + 3000,
              },
            });
          } else {
            callback({ success: true, entries: [], droppedCount: 0 });
          }
        }
      );

      debugTab.onTabVisibilityChanged(true);
      await flush(0);

      expect(document.getElementById('debug-batch-status-badge')?.textContent).toBe('Inaktiv');
      // Empty note IS shown while idle
      expect((document.getElementById('debug-queue-empty') as HTMLElement).style.display).toBe('');
      // Counters come from the last finished run, not zeroed
      expect(document.getElementById('debug-stat-processed')?.textContent).toBe('5');
      expect(document.getElementById('debug-stat-failed')?.textContent).toBe('1');
      expect(document.getElementById('debug-stat-total')?.textContent).toBe('6');
      const lastRun = document.getElementById('debug-last-run') as HTMLElement;
      expect(lastRun.hidden).toBe(false);
      expect(lastRun.textContent).toBe('Letzte Ausführung: 14:32:08.123');
    });

    it('shows no last-run marker when the backend delivers none', async () => {
      sendMessageMock.mockImplementation(
        (message: { action: string }, callback: (r: unknown) => void) => {
          if (message.action === 'getQueueStats') {
            callback({
              success: true,
              queue: { size: 0, waiting: 0, processing: 0, avgWaitTime: 0 },
              batch: {
                status: 'idle',
                total: 0,
                processed: 0,
                failed: 0,
                percentage: 0,
                isRunning: false,
              },
            });
          } else {
            callback({ success: true, entries: [], droppedCount: 0 });
          }
        }
      );

      debugTab.onTabVisibilityChanged(true);
      await flush(0);

      const lastRun = document.getElementById('debug-last-run') as HTMLElement;
      expect(lastRun.hidden).toBe(true);
      expect(lastRun.textContent).toBe('');
    });

    it('does not start a second poll interval on repeated activation', async () => {
      debugTab.onTabVisibilityChanged(true);
      await flush(0);
      const callsAfterFirst = sendMessageMock.mock.calls.length;
      expect(callsAfterFirst).toBeGreaterThan(0);

      // Idempotent re-activation must not stack intervals: one tick = 2 calls
      debugTab.onTabVisibilityChanged(true);
      await flush(1000);
      expect(sendMessageMock.mock.calls.length - callsAfterFirst).toBe(2);
    });

    it('shows Verbindung... on transport error and retries on next tick', async () => {
      let failNext = true;
      sendMessageMock.mockImplementation(
        (message: { action: string }, callback: (r: unknown) => void) => {
          if (failNext) {
            callback(undefined);
            (window as any).browser.runtime.lastError = { message: 'gone' };
            // sendMessage helper reads lastError after callback -> reject
            return;
          }
          (window as any).browser.runtime.lastError = undefined;
          callback({ success: true, queue: QUEUE_STATS_RESPONSE.queue, batch: QUEUE_STATS_RESPONSE.batch });
        }
      );

      debugTab.onTabVisibilityChanged(true);
      await flush(0);

      expect(document.getElementById('debug-connection-status')?.textContent).toBe(
        'Verbindung...'
      );

      // Recover on next tick
      failNext = false;
      sendMessageMock.mockImplementation(
        (message: { action: string }, callback: (r: unknown) => void) => {
          (window as any).browser.runtime.lastError = undefined;
          if (message.action === 'getDebugLogs') {
            callback({ success: true, entries: [], droppedCount: 0 });
          } else {
            callback(QUEUE_STATS_RESPONSE);
          }
        }
      );

      await flush(1000);
      expect(document.getElementById('debug-connection-status')?.textContent).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // Log rendering and filtering
  // --------------------------------------------------------------------------

  describe('log rendering and filtering', () => {
    beforeEach(async () => {
      debugTab.onTabVisibilityChanged(true);
      await flush(0);
    });

    it('renders entries newest-first', () => {
      const filter = document.getElementById('debug-log-filter') as HTMLSelectElement;
      filter.value = 'all';
      filter.dispatchEvent(new Event('change'));

      const times = Array.from(document.querySelectorAll('.debug-log-time')).map(
        (el) => el.textContent
      );
      expect(times).toEqual(['14:32:07.123', '14:32:06.123', '14:32:05.623', '14:32:05.123']);
    });

    it('renders level chips, message and monospace ctx with title', () => {
      const firstRow = document.querySelector('.debug-log-row') as HTMLElement;
      expect(firstRow.querySelector('.debug-log-level')?.textContent).toBe('ERROR');
      expect(firstRow.querySelector('.debug-log-msg')?.textContent).toBe('Analyse fehlgeschlagen');
      const ctx = firstRow.querySelector('.debug-log-ctx');
      expect(ctx?.textContent).toBe('{"id":3}');
      expect(ctx?.getAttribute('title')).toBe('{"id":3}');
    });

    it('default filter (Info) hides debug entries', () => {
      const msgs = Array.from(document.querySelectorAll('.debug-log-msg')).map(
        (el) => el.textContent
      );
      expect(msgs).not.toContain('Queue-Größe geprüft');
      expect(msgs).toHaveLength(3); // error, warn, info
    });

    it('filter "Fehler" hides all non-matching levels', () => {
      const filter = document.getElementById('debug-log-filter') as HTMLSelectElement;
      filter.value = 'error';
      filter.dispatchEvent(new Event('change'));

      const rows = document.querySelectorAll('.debug-log-row');
      expect(rows).toHaveLength(1);
      expect(rows[0].querySelector('.debug-log-msg')?.textContent).toBe('Analyse fehlgeschlagen');
    });

    it('filter "Alle" shows all entries including debug', () => {
      const filter = document.getElementById('debug-log-filter') as HTMLSelectElement;
      filter.value = 'all';
      filter.dispatchEvent(new Event('change'));

      expect(document.querySelectorAll('.debug-log-row')).toHaveLength(4);
    });

    it('shows dropped count when entries were dropped', async () => {
      sendMessageMock.mockImplementation(
        (message: { action: string }, callback: (r: unknown) => void) => {
          if (message.action === 'getDebugLogs') {
            callback({ success: true, entries: LOG_ENTRIES, droppedCount: 42 });
          } else {
            callback(QUEUE_STATS_RESPONSE);
          }
        }
      );

      await flush(1000);
      expect(document.getElementById('debug-dropped-count')?.textContent).toBe(
        '42 ältere Einträge verworfen'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Download
  // --------------------------------------------------------------------------

  describe('download', () => {
    let createObjectURLMock: ReturnType<typeof vi.fn>;
    let revokeObjectURLMock: ReturnType<typeof vi.fn>;
    let lastClicked: { href: string; download: string } | null;

    beforeEach(async () => {
      createObjectURLMock = vi.fn(() => 'blob:mock-url');
      revokeObjectURLMock = vi.fn();
      (URL as any).createObjectURL = createObjectURLMock;
      (URL as any).revokeObjectURL = revokeObjectURLMock;

      lastClicked = null;
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement
      ) {
        lastClicked = { href: this.href, download: this.download };
      });

      debugTab.onTabVisibilityChanged(true);
      await flush(0);
    });

    it('creates an object URL and triggers the download', () => {
      document.getElementById('debug-download-log-btn')!.click();

      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      const blob = createObjectURLMock.mock.calls[0][0] as Blob;
      expect(blob).toBeInstanceOf(Blob);

      expect(lastClicked).not.toBeNull();
      expect(lastClicked!.href).toBe('blob:mock-url');
      expect(lastClicked!.download).toMatch(/^ai-assistant-log-\d{8}-\d{6}\.txt$/);
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });

    it('downloads all entries regardless of the active filter', async () => {
      const blobText = vi.fn();
      createObjectURLMock.mockImplementation((blob: Blob) => {
        blob.text().then(blobText);
        return 'blob:mock-url';
      });

      // Active filter hides the debug entry - download must still include it
      document.getElementById('debug-download-log-btn')!.click();

      await flush(0);
      await flush(0);

      expect(blobText).toHaveBeenCalled();
      const text = await (createObjectURLMock.mock.calls[0][0] as Blob).text();
      expect(text).toContain('Queue-Größe geprüft');
      const lines = text.split('\n');
      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain('ERROR Analyse fehlgeschlagen {"id":3}');
    });
  });

  // --------------------------------------------------------------------------
  // Clear
  // --------------------------------------------------------------------------

  describe('clear', () => {
    it('calls clearDebugLogs and refreshes to the empty state', async () => {
      debugTab.onTabVisibilityChanged(true);
      await flush(0);
      expect(document.querySelectorAll('.debug-log-row')).toHaveLength(3);

      // Next poll returns an emptied log
      sendMessageMock.mockImplementation(
        (message: { action: string }, callback: (r: unknown) => void) => {
          if (message.action === 'getDebugLogs') {
            callback({ success: true, entries: [], droppedCount: 0 });
          } else {
            callback(QUEUE_STATS_RESPONSE);
          }
        }
      );

      document.getElementById('debug-clear-log-btn')!.click();
      await flush(0);

      const clearCalls = sendMessageMock.mock.calls.filter(
        (call) => (call[0] as any).action === 'clearDebugLogs'
      );
      expect(clearCalls).toHaveLength(1);

      // Immediate refresh: list is empty, empty state visible
      expect(document.querySelectorAll('.debug-log-row')).toHaveLength(0);
      const emptyNote = document.getElementById('debug-log-empty') as HTMLElement;
      expect(emptyNote.style.display).toBe('');
      expect(emptyNote.textContent).toBe('Keine Einträge');
    });
  });

  // --------------------------------------------------------------------------
  // Cancel
  // --------------------------------------------------------------------------

  describe('cancel', () => {
    it('sends cancelBatchAnalysis when clicked', async () => {
      debugTab.onTabVisibilityChanged(true);
      await flush(0);

      document.getElementById('debug-cancel-batch-btn')!.click();
      await flush(0);

      const cancelCalls = sendMessageMock.mock.calls.filter(
        (call) => (call[0] as any).action === 'cancelBatchAnalysis'
      );
      expect(cancelCalls).toHaveLength(1);
      expect(document.getElementById('debug-cancel-status')?.textContent).toBe('Abgebrochen');
    });
  });
});

// ============================================================================
// Live Entry Wiring (options.ts)
// ============================================================================

/**
 * Proves the shipped entry (options.ts, webpack 'options' entry) drives the
 * DebugTab: clicking the data-tab="debug" button through the same
 * initializeTabs() binding used at runtime starts/stops the poll.
 */
describe('options.ts DebugTab wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="tab-bar">
        <button class="tab-button active" data-tab="provider-settings">Provider</button>
        <button class="tab-button" data-tab="debug">Debug</button>
      </div>
      <div id="provider-settings" class="tab-content active"></div>
      <div id="debug" class="tab-content"></div>`;
    installBrowserMock();
    initializeTabs(
      document.querySelectorAll('.tab-button'),
      document.querySelectorAll('.tab-content')
    );
  });

  afterEach(() => {
    // Stop any polling the module-level instance may have started
    document.querySelector<HTMLButtonElement>('[data-tab="provider-settings"]')?.click();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts polling (getQueueStats/getDebugLogs) when the Debug tab is activated', async () => {
    expect(sendMessageMock).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>('[data-tab="debug"]')!.click();
    await vi.advanceTimersByTimeAsync(0);

    const actions = sendMessageMock.mock.calls.map((call) => (call[0] as any).action);
    expect(actions).toContain('getQueueStats');
    expect(actions).toContain('getDebugLogs');
  });

  it('stops polling when switching away from the Debug tab', async () => {
    document.querySelector<HTMLButtonElement>('[data-tab="debug"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    const countAfterStart = sendMessageMock.mock.calls.length;
    expect(countAfterStart).toBeGreaterThan(0);

    document.querySelector<HTMLButtonElement>('[data-tab="provider-settings"]')!.click();
    await vi.advanceTimersByTimeAsync(3000);

    expect(sendMessageMock.mock.calls.length).toBe(countAfterStart);
  });
});
