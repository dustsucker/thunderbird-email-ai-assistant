/**
 * Logger interface for logging functionality across the application.
 *
 * Provides methods for logging at different severity levels and utility
 * functions for handling sensitive data like API keys.
 */
export interface ILogger {
  /**
   * Log a debug message.
   *
   * Debug messages are for detailed information useful for debugging.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  debug(message: string, context?: Record<string, unknown>): void;

  /**
   * Log an informational message.
   *
   * Info messages are for general informational messages.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  info(message: string, context?: Record<string, unknown>): void;

  /**
   * Log a warning message.
   *
   * Warning messages are for potentially harmful situations that should be noted.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  warn(message: string, context?: Record<string, unknown>): void;

  /**
   * Log an error message.
   *
   * Error messages are for error events that might still allow the application to continue running.
   *
   * @param message - The message to log
   * @param context - Optional context object with additional metadata
   */
  error(message: string, context?: Record<string, unknown>): void;

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
   */
  maskApiKey(key?: string): string;
}
