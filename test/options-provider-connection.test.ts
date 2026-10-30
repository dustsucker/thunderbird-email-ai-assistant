/**
 * Tests for the "Verbindung testen" button of the options page.
 *
 * The test goes through the real provider classes (listModels → GET /models),
 * only fetch is mocked.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { testProviderConnection } from '../options';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('testProviderConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('meldet Erfolg, wenn der Provider Modelle zurückliefert', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await testProviderConnection('openai', {
      apiKey: 'sk-test-key-1234567890',
      model: '',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('2');
    expect(result.message).toContain('Verbindung OK');
  });

  it('meldet einen lesbaren Fehler, wenn der Provider mit 401 antwortet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await testProviderConnection('openai', {
      apiKey: 'sk-invalid-key-000000',
      model: '',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Verbindung fehlgeschlagen');
    expect(result.message).not.toContain('undefined');
    expect(result.message).not.toContain('[object');
  });

  it('fängt Netzwerkfehler ab, ohne zu werfen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('NetworkError when attempting fetch'))
    );

    const result = await testProviderConnection('openai', {
      apiKey: 'sk-test-key-1234567890',
      model: '',
    });

    // Der Provider schluckt den Netzwerkfehler und liefert eine leere Modellliste:
    // die UI muss daraus eine lesbare Meldung machen, nicht werfen.
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Verbindung fehlgeschlagen');
    expect(result.message).toContain('API-Schlüssel');
  });

  it('nutzt den Ollama-Pfad (GET /api/tags) der bestehenden Provider-Klasse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        models: [{ name: 'llama3.2' }],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await testProviderConnection('ollama', {
      apiKey: '',
      model: 'llama3.2',
      apiUrl: 'http://localhost:11434',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.anything());
  });
});
