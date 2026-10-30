/**
 * Debug tab: logging settings (enableLogging + level, #3-UI) and the
 * defensive cache-error counter (#8-UI).
 *
 * @module test/interfaces/options/debug-logging-settings
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { DebugTab } from '@/interfaces/options/DebugTab';

/** Minimal mirror of the debug tab markup used by these features. */
const MARKUP = `
<div id="debug" class="tab-content">
  <div class="debug-stats-grid">
    <div class="debug-stat" id="debug-stat-cache-errors-wrap" hidden>
      <span id="debug-stat-cache-errors" class="debug-stat-value">0</span>
      <span class="debug-stat-label">Cache-Fehler</span>
    </div>
  </div>
  <div class="debug-log-toolbar">
    <label for="debug-enable-logging">
      <input type="checkbox" id="debug-enable-logging" /> Protokollierung aktivieren
    </label>
    <select id="debug-log-level">
      <option value="debug">Debug</option>
      <option value="info" selected>Info</option>
      <option value="warn">Warnung</option>
      <option value="error">Fehler</option>
    </select>
  </div>
</div>
`;

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  maskApiKey: vi.fn((key: string) => key),
};

describe('DebugTab logging settings and cache errors', () => {
  let store: Record<string, unknown>;
  let storageSet: ReturnType<typeof vi.fn>;

  function installStorage(appConfig: Record<string, unknown>): void {
    store = { appConfig: { ...appConfig } };
    storageSet = vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    });
    (globalThis as unknown as Record<string, unknown>).messenger = {
      storage: { local: { get: vi.fn(async () => structuredClone(store)), set: storageSet } },
    };
  }

  beforeEach(() => {
    document.body.innerHTML = MARKUP;
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).messenger;
    delete (window as { browser?: unknown }).browser;
    vi.restoreAllMocks();
  });

  it('übernimmt gespeicherte Protokollierungs-Einstellungen in die Steuerungen', async () => {
    installStorage({ enableLogging: true, logLevel: 'warn', defaultProvider: 'openai' });

    new DebugTab(mockLogger as never).render();
    await vi.waitFor(() => {
      expect(
        (document.getElementById('debug-enable-logging') as HTMLInputElement).checked
      ).toBe(true);
    });

    expect((document.getElementById('debug-log-level') as HTMLSelectElement).value).toBe('warn');
  });

  it('schreibt Änderungen in den bestehenden appConfig-Key', async () => {
    installStorage({ enableLogging: false, logLevel: 'info', defaultProvider: 'openai' });

    new DebugTab(mockLogger as never).render();
    await vi.waitFor(() => {
      expect(
        (document.getElementById('debug-enable-logging') as HTMLInputElement).checked
      ).toBe(false);
    });

    const checkbox = document.getElementById('debug-enable-logging') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    const select = document.getElementById('debug-log-level') as HTMLSelectElement;
    select.value = 'error';
    select.dispatchEvent(new Event('change'));

    await vi.waitFor(() => expect(storageSet).toHaveBeenCalledTimes(2));

    const appConfig = store.appConfig as Record<string, unknown>;
    expect(appConfig.enableLogging).toBe(true);
    expect(appConfig.logLevel).toBe('error');
    // Bestehende Keys bleiben erhalten
    expect(appConfig.defaultProvider).toBe('openai');
  });

  it('rendert den Cache-Fehler-Zähler nur, wenn das Feld geliefert wird', async () => {
    installStorage({});

    const wrap = document.getElementById('debug-stat-cache-errors-wrap')!;
    const value = document.getElementById('debug-stat-cache-errors')!;

    const respond = (cacheErrors?: number): void => {
      (window as unknown as { browser: unknown }).browser = {
        runtime: {
          sendMessage: (
            message: { action: string },
            callback: (r: unknown) => void
          ) => {
            if (message.action === 'getQueueStats') {
              callback({
                success: true,
                ...(cacheErrors !== undefined ? { cacheErrors } : {}),
                queue: { size: 0, waiting: 0, processing: 0, avgWaitTime: 0 },
                batch: {
                  status: 'idle',
                  total: 0,
                  processed: 0,
                  failed: 0,
                  successful: 0,
                  percentage: 0,
                  isRunning: false,
                  startTime: 0,
                },
              });
            } else {
              callback({ success: true, entries: [], droppedCount: 0 });
            }
          },
        },
      };

      const tab = new DebugTab(mockLogger as never);
      // pollTick ist privat; über den Sichtbarkeits-Hook starten
      tab.onTabVisibilityChanged(true);
      tab.onTabVisibilityChanged(false);
    };

    respond(7);
    await vi.waitFor(() => expect(wrap.hidden).toBe(false));
    expect(value.textContent).toBe('7');

    respond();
    await vi.waitFor(() => expect(wrap.hidden).toBe(true));
    expect(value.textContent).toBe('');
  });

  it('belässt die Steuerungen unangetastet, wenn kein storage.local existiert', () => {
    new DebugTab(mockLogger as never).render();

    expect((document.getElementById('debug-enable-logging') as HTMLInputElement).checked).toBe(
      false
    );
    expect((document.getElementById('debug-log-level') as HTMLSelectElement).value).toBe('info');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
