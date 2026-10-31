/**
 * Clicks the real "Verbindung testen" button of the options page against a
 * stubbed fetch and checks the inline result next to the button.
 *
 * Guards the wiring, not only testProviderConnection(): a provider that fakes
 * a model list on failure (the ZAI ones did) must still show an error here.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fetchZaiModels } from '../src/infrastructure/providers';

const html = readFileSync(path.resolve(__dirname, '../options.html'), 'utf-8');

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as unknown as Response;
}

function panel(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function apiKeyInput(panelId: string): HTMLInputElement {
  return panel(panelId).querySelector('input[data-validate="api-key"]') as HTMLInputElement;
}

/** Clicks the panel's button and waits until the handler re-enables it. */
async function clickTestButton(panelId: string): Promise<{
  button: HTMLButtonElement;
  result: HTMLSpanElement;
}> {
  const button = panel(panelId).querySelector('.test-connection') as HTMLButtonElement;
  button.click();
  expect(button.disabled).toBe(true);

  for (let i = 0; i < 50 && button.disabled; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return { button, result: button.nextElementSibling as HTMLSpanElement };
}

beforeAll(async () => {
  const body = html.match(/<body>([\s\S]*)<\/body>/)![1];
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');

  (globalThis as unknown as Record<string, unknown>).messenger = {
    storage: {
      local: {
        get: vi.fn(async () => ({
          appConfig: { defaultProvider: 'openai' },
          providerSettings: {},
        })),
        set: vi.fn(async () => {}),
      },
    },
    runtime: { reload: vi.fn(), getManifest: vi.fn(() => ({ version: '1.0.5' })), onMessage: { addListener: vi.fn() } },
    permissions: { request: vi.fn(async () => true) },
  };

  await import('../options');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise((resolve) => setTimeout(resolve, 200));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Verbindung testen button', () => {
  it('zeigt Erfolg inline an und gibt den Button wieder frei', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }],
        })
      )
    );

    apiKeyInput('openai-settings').value = 'sk-1234567890';
    const { button, result } = await clickTestButton('openai-settings');

    expect(result.textContent).toContain('Verbindung OK');
    expect(result.classList.contains('is-ok')).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it("zeigt bei falschem Zai-PaaS-Key einen Fehler statt 'Verbindung OK'", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' })));

    apiKeyInput('zai-paas-settings').value = 'sk-invalid-key-000000';
    const { button, result } = await clickTestButton('zai-paas-settings');

    expect(result.textContent).toBe(
      'Verbindung fehlgeschlagen: API-Schlüssel ungültig oder abgelaufen.'
    );
    expect(result.textContent).not.toContain('Verbindung OK');
    expect(result.textContent).not.toMatch(/Failed to fetch|Unauthorized/);
    expect(result.classList.contains('is-error')).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it('zeigt bei falschem Zai-Coding-Key einen Fehler', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('NetworkError when attempting fetch'))
    );

    apiKeyInput('zai-coding-settings').value = 'sk-invalid-key-000000';
    const { button, result } = await clickTestButton('zai-coding-settings');

    expect(result.textContent).toBe(
      'Verbindung fehlgeschlagen: API nicht erreichbar (Netzwerkfehler).'
    );
    expect(result.textContent).not.toContain('Verbindung OK');
    expect(result.textContent).not.toContain('NetworkError');
    expect(result.classList.contains('is-error')).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it('zeigt ohne API-Key die deutsche Meldung (kein Request)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    apiKeyInput('zai-paas-settings').value = '';
    const { button, result } = await clickTestButton('zai-paas-settings');

    expect(result.textContent).toBe('Verbindung fehlgeschlagen: API-Schlüssel fehlt.');
    expect(result.textContent).not.toMatch(/API key is|required/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
  });

  it('zeigt bei unerwartetem Antwortformat die deutsche Meldung', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { unexpected: true })));

    apiKeyInput('zai-coding-settings').value = 'sk-1234567890';
    const { button, result } = await clickTestButton('zai-coding-settings');

    expect(result.textContent).toBe('Verbindung fehlgeschlagen: Unerwartete Antwort vom Anbieter.');
    expect(result.textContent).not.toContain('Invalid response format');
    expect(button.disabled).toBe(false);
  });

  it('zeigt bei unbekanntem HTTP-Status eine deutsche Meldung mit Status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(502, { error: 'upstream' })));

    apiKeyInput('zai-paas-settings').value = 'sk-1234567890';
    const { result } = await clickTestButton('zai-paas-settings');

    expect(result.textContent).toBe(
      'Verbindung fehlgeschlagen: Server nicht erreichbar (Status 502).'
    );
  });

  it('zeigt bei unbekanntem Fehler einen deutschen Fallback mit Roh-Text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Something odd happened')));

    apiKeyInput('zai-paas-settings').value = 'sk-1234567890';
    const { result } = await clickTestButton('zai-paas-settings');

    expect(result.textContent).toBe(
      'Verbindung fehlgeschlagen: Unbekannter Fehler (Something odd happened).'
    );
  });
});

describe('fetchZaiModels (Modell-Datalist)', () => {
  it('liefert die Fallback-Liste, wenn die Z.ai-API nicht erreichbar ist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('NetworkError')));

    const models = await fetchZaiModels('sk-1234567890');

    expect(models).toContain('glm-4.5');
    expect(models.length).toBeGreaterThan(0);
  });
});
