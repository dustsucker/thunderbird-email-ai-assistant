/**
 * Unit tests for ConsoleLogger output gating (issue #3):
 * - `configure({ enabled: false })` discards console AND debug-buffer output
 * - `configure({ level })` gates levels below the configured minimum
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConsoleLogger } from '../../../src/infrastructure/logger/ConsoleLogger';
import { debugLogBuffer } from '../../../src/infrastructure/logger/DebugLogBuffer';

describe('ConsoleLogger gating', () => {
  const logger = new ConsoleLogger();
  let consoleInfo: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleDebug: ReturnType<typeof vi.spyOn>;
  let bufferAdd: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    bufferAdd = vi.spyOn(debugLogBuffer, 'add').mockImplementation(() => {});
  });

  afterEach(() => {
    // Reset shared gate state for other tests
    logger.configure({ enabled: true, level: 'debug' });
    vi.restoreAllMocks();
  });

  describe('enable gating', () => {
    it('emits to console and buffer when enabled (default)', () => {
      logger.info('hello', { key: 'value' });

      expect(consoleInfo).toHaveBeenCalledTimes(1);
      expect(bufferAdd).toHaveBeenCalledWith('info', 'hello', expect.any(String));
    });

    it('discards everything when enableLogging=false', () => {
      logger.configure({ enabled: false });

      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(consoleDebug).not.toHaveBeenCalled();
      expect(consoleInfo).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(bufferAdd).not.toHaveBeenCalled();
    });

    it('re-enables output after being disabled', () => {
      logger.configure({ enabled: false });
      logger.configure({ enabled: true });
      logger.info('back');

      expect(consoleInfo).toHaveBeenCalledTimes(1);
      expect(bufferAdd).toHaveBeenCalledTimes(1);
    });
  });

  describe('level gating', () => {
    it('level=warn drops debug and info, passes warn and error', () => {
      logger.configure({ level: 'warn' });

      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(consoleDebug).not.toHaveBeenCalled();
      expect(consoleInfo).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(bufferAdd).toHaveBeenCalledTimes(2);
      expect(bufferAdd).toHaveBeenNthCalledWith(1, 'warn', 'w', undefined);
      expect(bufferAdd).toHaveBeenNthCalledWith(2, 'error', 'e', undefined);
    });

    it('level=error passes only errors', () => {
      logger.configure({ level: 'error' });

      logger.warn('w');
      logger.error('e');

      expect(consoleWarn).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(bufferAdd).toHaveBeenCalledTimes(1);
    });

    it('level=debug passes everything', () => {
      logger.configure({ level: 'debug' });

      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(bufferAdd).toHaveBeenCalledTimes(4);
    });
  });

  it('sanitizes context before writing to console and buffer', () => {
    logger.info('msg', { apiKey: 'sk-1234567890abcdef', tagKey: 'work' });

    const consoleArg = String(consoleInfo.mock.calls[0][0]);
    const bufferCtx = String(bufferAdd.mock.calls[0][2]);

    expect(consoleArg).not.toContain('sk-1234567890abcdef');
    expect(bufferCtx).not.toContain('sk-1234567890abcdef');
    expect(bufferCtx).toContain('work');
  });
});
