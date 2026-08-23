/**
 * Unit tests for BackgroundScript (DW10e: onSuspend block removed).
 */

import { describe, it, expect, vi } from 'vitest';
import { BackgroundScript } from '@/background/BackgroundScript';

describe('BackgroundScript', () => {
  it('no longer registers a runtime.onSuspend handler', () => {
    const onSuspendAdd = vi.fn();
    vi.stubGlobal('messenger', {
      runtime: { onSuspend: { addListener: onSuspendAdd } },
    });

    const script = new BackgroundScript();
    // registerShutdownHandler was removed — onSuspend must never be touched
    expect(
      (script as unknown as Record<string, unknown>).registerShutdownHandler
    ).toBeUndefined();
    expect(onSuspendAdd).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('shutdown() is a safe no-op when not initialized', async () => {
    const script = new BackgroundScript();
    await expect(script.shutdown()).resolves.toBeUndefined();
  });
});
