import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorType,
  logAndDisplayError,
} from '@/infrastructure/providers/ProviderUtils';

/**
 * Issue #18: errors must not be silently dropped when the options page is
 * closed — the dead runtime channel falls back to messenger.notifications.create.
 *
 * Manuelle Verifikation der statischen DOM-Kriterien (nicht via Vitest abbildbar):
 * 1. `grep -c 'id="error-display-overlay"' options.html` ergibt genau 1
 *    (options.html:907, statisch; dynamische Erzeugung entfernt).
 * 2. showError in options.ts (~:1748) enthält kein setTimeout — info/warn
 *    bleibt bis Close/Ersetzen sichtbar (Close-Button options.ts:~2384).
 */
describe('logAndDisplayError notification fallback (#18)', () => {
  let sendMessage: ReturnType<typeof vi.fn>;
  let createNotification: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessage = vi.fn();
    createNotification = vi.fn();
    vi.stubGlobal('messenger', {
      runtime: { sendMessage },
      notifications: { create: createNotification },
    } as unknown as typeof messenger);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to notifications.create when the runtime channel is dead', async () => {
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));

    logAndDisplayError(new Error('API exploded'), ErrorType.API, { provider: 'openai' });

    await vi.waitFor(() => expect(createNotification).toHaveBeenCalledTimes(1));
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'basic',
        title: 'AI Tag Assistant',
        message: 'API exploded',
      })
    );
  });

  it('does not notify when the options page received the error', async () => {
    sendMessage.mockResolvedValue({ success: true });

    logAndDisplayError(new Error('API exploded'), ErrorType.API);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('does not throw when no extension context exists', () => {
    vi.unstubAllGlobals();

    expect(() => logAndDisplayError(new Error('boom'), ErrorType.SYSTEM)).not.toThrow();
    expect(createNotification).not.toHaveBeenCalled();
  });
});
