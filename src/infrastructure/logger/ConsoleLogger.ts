/**
 * Console-based implementation of the ILogger interface.
 *
 * This logger outputs messages to the browser/Node.js console with appropriate
 * log levels and includes optional context information. It uses TSyringe for
 * dependency injection support.
 */

import { injectable } from 'tsyringe';
import type { ILogger } from '../interfaces/ILogger';

/**
 * ConsoleLogger implementation.
 *
 * @remarks
 * This implementation is suitable for both browser extensions (console methods
 * available in extension contexts) and Node.js environments. Messages are
 * formatted with a [LOG] prefix to distinguish them from other console output.
 */
@injectable()
export class ConsoleLogger implements ILogger {
  /**
   * Format a log message with optional context.
   *
   * @param message - The message to format
   * @param context - Optional context object with additional metadata
   * @returns Formatted message string
   */
  private formatMessage(message: string, context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
      return `[LOG] ${message}`;
    }
    return `[LOG] ${message} ${JSON.stringify(context)}`;
  }

  /**
   * Log a debug message to the console.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(this.formatMessage(message, context));
  }

  /**
   * Log an informational message to the console.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  info(message: string, context?: Record<string, unknown>): void {
    console.info(this.formatMessage(message, context));
  }

  /**
   * Log a warning message to the console.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(this.formatMessage(message, context));
  }

  /**
   * Log an error message to the console.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  error(message: string, context?: Record<string, unknown>): void {
    console.error(this.formatMessage(message, context));
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
