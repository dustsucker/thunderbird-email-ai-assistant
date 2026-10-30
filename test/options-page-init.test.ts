/**
 * Runs the real options page (options.html + options.ts) against a stubbed
 * messenger and checks tab wiring, key toggles, inline validation and status
 * feedback.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const html = readFileSync(path.resolve(__dirname, '../options.html'), 'utf-8');
const store: Record<string, unknown> = {};
const storageSet = vi.fn(async (items: Record<string, unknown>) => {
  Object.assign(store, items);
});

beforeAll(async () => {
  const body = html.match(/<body>([\s\S]*)<\/body>/)![1];
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');

  (globalThis as unknown as Record<string, unknown>).messenger = {
    storage: {
      local: {
        get: vi.fn(async () => ({ appConfig: { defaultProvider: 'openai' }, providerSettings: {} })),
        set: storageSet,
      },
    },
    runtime: { reload: vi.fn(), onMessage: { addListener: vi.fn() } },
    permissions: { request: vi.fn(async () => true) },
  };

  await import('../options');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise((resolve) => setTimeout(resolve, 200));
});

describe('options page', () => {
  it('synchronisiert aria-selected beim Tab-Wechsel', () => {
    const providerTab = document.getElementById('tab-provider-settings')!;
    const debugTab = document.getElementById('tab-debug')!;

    debugTab.click();

    expect(debugTab.getAttribute('aria-selected')).toBe('true');
    expect(providerTab.getAttribute('aria-selected')).toBe('false');
    expect(document.getElementById('debug')?.classList.contains('active')).toBe(true);

    providerTab.click();
    expect(providerTab.getAttribute('aria-selected')).toBe('true');
  });

  it('schaltet die Sichtbarkeit eines API-Keys um', () => {
    const toggle = document.querySelector<HTMLButtonElement>('#openai-settings .key-toggle')!;
    const field = document.getElementById('openai-api-key') as HTMLInputElement;

    expect(field.type).toBe('password');

    toggle.click();
    expect(field.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent?.trim()).toBe('Verbergen');

    toggle.click();
    expect(field.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('zeigt Feldfehler inline statt einer Browser-Bubble und speichert nicht', async () => {
    const field = document.getElementById('openai-api-key') as HTMLInputElement;
    field.value = '';

    document
      .getElementById('provider-options-form')!
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const error = field.closest('.form-group')?.querySelector('.field-error');
    expect(error?.textContent).toBe('API-Schlüssel erforderlich.');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toContain(`${field.id}-error`);
    expect(storageSet).not.toHaveBeenCalled();

    // Nachbessern raeumt den Fehler weg
    field.value = 'sk-1234567890';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(field.closest('.form-group')?.querySelector('.field-error')).toBeNull();
    expect(field.hasAttribute('aria-invalid')).toBe(false);
  });

  it('meldet Fehler in Danger-Farbe und laesst sie stehen', async () => {
    const status = document.getElementById('provider-status-message')!;
    const field = document.getElementById('openai-api-key') as HTMLInputElement;

    field.value = '';
    document
      .getElementById('provider-options-form')!
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(status.classList.contains('status-error')).toBe(true);
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).not.toBe('');

    vi.useFakeTimers();
    vi.advanceTimersByTime(10000);
    expect(status.textContent).not.toBe('');
    vi.useRealTimers();
  });
});
