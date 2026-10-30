/**
 * Console-based implementation of the ILogger interface.
 *
 * This logger outputs messages to the browser/Node.js console with appropriate
 * log levels and includes optional context information. It uses TSyringe for
 * dependency injection support.
 */

import { injectable } from 'tsyringe';
import type { ILogger } from '../interfaces/ILogger';
import { sanitizeForLogging } from '@/shared/utils/loggingUtils';
import { debugLogBuffer, type DebugLogLevel } from './DebugLogBuffer';

// ============================================================================
// Shared Output Gate (issue #3)
// ============================================================================

const LEVEL_RANK: Record<DebugLogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Configuration for the shared logger gate.
 */
export interface LoggerGateConfig {
  /** Master switch: `false` discards ALL output (console + debug buffer). */
  enabled?: boolean;
  /** Minimum level: messages below this level are discarded. */
  level?: DebugLogLevel;
}

/**
 * Output gate shared by ALL ConsoleLogger instances (DI-resolved and the
 * module-level `sharedLogger`). Mutated via {@link ConsoleLogger.configure};
 * read on every log call so a single config write affects every instance.
 */
const gate: { enabled: boolean; minLevel: DebugLogLevel } = { enabled: true, minLevel: 'debug' };

/**
 * ConsoleLogger implementation.
 *
 * @remarks
 * This implementation is suitable for both browser extensions (console methods
 * available in extension contexts) and Node.js environments. Messages are
 * formatted with a [LOG] prefix to distinguish them from other console output.
 * All context objects are automatically sanitized to prevent API key leakage.
 * Output is gated on a shared level/enable switch (see {@link configure}).
 */
@injectable()
export class ConsoleLogger implements ILogger {
  /**
   * Configures the shared output gate for all ConsoleLogger instances.
   *
   * Called at startup with the persisted `enableLogging` config value.
   *
   * @param config - Partial gate configuration; omitted keys are unchanged
   */
  configure(config: LoggerGateConfig): void {
    if (config.enabled !== undefined) gate.enabled = config.enabled;
    if (config.level !== undefined) gate.minLevel = config.level;
  }

  /** Returns the current shared gate state (for tests/diagnostics). */
  getGate(): Readonly<{ enabled: boolean; minLevel: DebugLogLevel }> {
    return gate;
  }

  /** Returns true if a message at the given level passes the shared gate. */
  private shouldLog(level: DebugLogLevel): boolean {
    return gate.enabled && LEVEL_RANK[level] >= LEVEL_RANK[gate.minLevel];
  }

  /**
   * Format a log message with optional context.
   * Context is sanitized to prevent sensitive data leakage.
   *
   * @param message - The message to format
   * @param context - Optional context object with additional metadata
   * @returns Formatted message string
   */
  private formatMessage(message: string, context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
      return `[LOG] ${message}`;
    }
    // SECURITY: Sanitize context before stringifying to prevent API key leakage
    const sanitizedContext = sanitizeForLogging(context);
    return `[LOG] ${message} ${JSON.stringify(sanitizedContext)}`;
  }

  /**
   * Routes a message to the console and the shared debug log buffer.
   * Context is sanitized once here (masked before reaching the buffer).
   */
  private emit(level: DebugLogLevel, message: string, context?: Record<string, unknown>): void {
    const sanitized = context && Object.keys(context).length > 0
      ? JSON.stringify(sanitizeForLogging(context))
      : undefined;
    debugLogBuffer.add(level, message, sanitized);
  }

  /**
   * Log a debug message to the console.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    console.debug(this.formatMessage(message, context));
    this.emit('debug', message, context);
  }

  /**
   * Log an informational message to the console.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    console.info(this.formatMessage(message, context));
    this.emit('info', message, context);
  }

  /**
   * Log a warning message to the console.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage(message, context));
    this.emit('warn', message, context);
  }

  /**
   * Log an error message to the console.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  error(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    console.error(this.formatMessage(message, context));
    this.emit('error', message, context);
  }

  /**
   * Mask an API key for safe logging.
   *
   * Returns the first 7 characters, ellipsis, and last 3 characters.
   * This format allows partial identification without exposing the full key.
   *
   * @param key - The API key to mask (optional)
   * @returns Masked API key string or "not set" if key is falsy
   *
   * @example
   * maskApiKey("sk-proj-abc123def456") // "sk-proj-...456"
   * maskApiKey("") // "not set"
   * maskApiKey(undefined) // "not set"
   */
  maskApiKey(key?: string): string {
    if (!key || typeof key !== 'string') {
      return 'not set';
    }
    if (key.length <= 10) {
      return '***';
    }
    return `${key.slice(0, 7)}...${key.slice(-3)}`;
  }
}

/**
 * Module-level logger for non-DI call sites (ProviderUtils, MemoryCache).
 * Shares the gate and the debug buffer with every DI-resolved ConsoleLogger,
 * so a single `configure()` at startup governs all logging paths (issue #11).
 */
export const sharedLogger = new ConsoleLogger();
