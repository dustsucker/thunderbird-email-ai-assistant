/**
 * Debug-Tab polling on page load (options.ts init).
 *
 * Regression: polling only started on tab *click* — a page load with the
 * Debug tab already active polled nothing. This test loads the real options
 * page with the Debug tab active and proves the init path starts the poll
 * without any click, and that re-activation does not stack intervals.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const html = readFileSync(path.resolve(__dirname, '../options.html'), 'utf-8');

/** Callback-style browser.runtime.sendMessage mock (DebugTab transport). */
const sendMessageMock = vi.fn();

beforeAll(async () => {
  const body = html.match(/<body>([\s\S]*)<\/body>/)![1];
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');

  // Activate the Debug tab as it would be on a restored page load
  document.getElementById('tab-provider-settings')?.classList.remove('active');
  document.getElementById('tab-debug')?.classList.add('active');

  (globalThis as unknown as Record<string, unknown>).messenger = {
    storage: {
      local: {
        get: vi.fn(async () => ({ appConfig: { defaultProvider: 'openai' }, providerSettings: {} })),
        set: vi.fn(async () => undefined),
      },
    },
    runtime: { reload: vi.fn(), getManifest: vi.fn(() => ({ version: '1.0.5' })), onMessage: { addListener: vi.fn() } },
    permissions: { request: vi.fn(async () => true) },
  };

  (window as unknown as Record<string, unknown>).browser = {
    runtime: { sendMessage: sendMessageMock, lastError: undefined, onMessage: { addListener: vi.fn() } },
  };
  sendMessageMock.mockImplementation((message: { action: string }, callback: (r: unknown) => void) => {
    if (message.action === 'getQueueStats') {
      callback({
        success: true,
        queue: { size: 0, waiting: 0, processing: 0, avgWaitTime: 0 },
        batch: { status: 'idle', total: 0, processed: 0, failed: 0, percentage: 0, isRunning: false },
      });
    } else if (message.action === 'getDebugLogs') {
      callback({ success: true, entries: [], droppedCount: 0 });
    } else {
      callback({ success: true });
    }
  });

  await import('../options');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise((resolve) => setTimeout(resolve, 100));
});

afterAll(() => {
  // Stop the module-level DebugTab's interval
  document.querySelector<HTMLButtonElement>('[data-tab="provider-settings"]')?.click();
});

describe('options page init with active Debug tab', () => {
  it('starts queue polling on page load without any tab click', () => {
    const actions = sendMessageMock.mock.calls.map((call) => (call[0] as { action: string }).action);
    expect(actions).toContain('getQueueStats');
    expect(actions).toContain('getDebugLogs');
  });

  it('does not stack a second interval when the Debug tab is re-activated', async () => {
    const before = sendMessageMock.mock.calls.length;
    document.querySelector<HTMLButtonElement>('[data-tab="debug"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // One tick (stats + logs) beyond the init poll — not two intervals' worth
    const growth = sendMessageMock.mock.calls.length - before;
    expect(growth).toBeGreaterThanOrEqual(2);
    expect(growth).toBeLessThan(4);
  });
});
