/**
 * Utility functions for provider implementations
 * @module providers/utils
 */

import type { AppConfig, CustomTags } from '@/shared/types/ProviderTypes';
import type { RequestBody } from './BaseProvider';

// ============================================================================
// TYPE DEFINITIONS AND INTERFACES
// ============================================================================

/**
 * Log levels for the logger
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Error severity levels for UI display
 * - CRITICAL: Shows as alert/dialog, requires user attention
 * - WARNING: Shows as toast notification, non-blocking
 * - INFO: Shows as status message, informational only
 */
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/**
 * Error types for categorization
 */
export enum ErrorType {
  API = 'api', // API call failures
  PROVIDER = 'provider', // Provider-specific errors
  USER = 'user', // User configuration/validation errors
  SYSTEM = 'system', // System-level errors (storage, permissions)
  NETWORK = 'network', // Network connectivity errors
  VALIDATION = 'validation', // Input validation errors
}

/**
 * Error display message for runtime communication
 */
export interface ErrorDisplay {
  message: string;
  severity: ErrorSeverity;
  type?: ErrorType;
  context?: LoggerContext;
}

/**
 * Runtime message for error display
 */
export interface ShowErrorRuntimeMessage {
  action: 'showError';
  error: ErrorDisplay;
}

/**
 * Log context object with optional metadata
 */
export type LoggerContext = Record<string, unknown>;

/**
 * Sanitized log context with stringified values
 */
type SanitizedContext = Record<string, unknown> | string;

/**
 * Logger interface with typed methods
 */
export interface Logger {
  debug(message: string, context?: LoggerContext): void;
  info(message: string, context?: LoggerContext): void;
  warn(message: string, context?: LoggerContext): void;
  error(message: string, context?: LoggerContext): void;
  setLogLevel(level: LogLevel): void;
}

/**
 * Error types for transient error detection
 */
interface BaseError extends Error {
  name: string;
  message: string;
  cause?: {
    code?: string;
    [key: string]: unknown;
  };
}

/**
 * Type guard for error objects
 */
function isError(value: unknown): value is Error {
  return (
    value instanceof Error || (typeof value === 'object' && value !== null && 'message' in value)
  );
}

/**
 * Type guard for errors with cause property
 */
function isErrorWithCause(error: Error): error is BaseError {
  return 'cause' in error && typeof error.cause === 'object' && error.cause !== null;
}

/**
 * HTTP Response with status
 */
export interface HttpResponse {
  status: number;
  [key: string]: unknown;
}

/**
 * Configuration options for retry with backoff
 */
export interface RetryConfig<T = unknown> {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay in milliseconds */
  baseDelay?: number;
  /** Exponential backoff multiplier */
  factor?: number;
  /** Jitter factor for random delay variation (0-1) */
  jitter?: number;
}

/**
 * Schema field definition for validation
 */
interface SchemaField<T = unknown> {
  type: 'string' | 'number' | 'array' | 'boolean';
  required: boolean;
  default: T;
  itemType?: string;
  validate?: (value: unknown) => boolean;
}

/**
 * Schema definition map
 */
type SchemaDefinition = Record<string, SchemaField>;

/**
 * Tag response from LLM
 */
export interface TagResponse {
  tags: string[];
  confidence: number;
  reasoning: string;
  [key: string]: unknown;
}

/**
 * Validated unknown data
 */
export type Validated<T> = T;

// ============================================================================
// API SCHEMA DEFINITIONS
// ============================================================================

/**
 * Schema definition for Tag responses
 */
const TAG_RESPONSE_SCHEMA: SchemaDefinition = {
  tags: {
    type: 'array',
    itemType: 'string',
    required: true,
    default: [] as string[],
  },
  confidence: {
    type: 'number',
    required: true,
    default: 0.5,
    validate: (value: unknown): boolean => typeof value === 'number' && value >= 0 && value <= 1,
  },
  reasoning: {
    type: 'string',
    required: false,
    default: '',
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Masks an API key for logging purposes
 * Shows first 7 and last 3 characters with ellipsis in between
 *
 * @param key - The API key to mask
 * @returns Masked key string
 *
 * @example
 * maskApiKey('sk-1234567890abcdef') // Returns 'sk-1234...def'
 * maskApiKey('short') // Returns '***'
 * maskApiKey(null) // Returns 'not set'
 */
export function maskApiKey(key: unknown): string {
  if (!key || typeof key !== 'string') return 'not set';
  if (key.length <= 10) return '***';
  return key.slice(0, 7) + '...' + key.slice(-3);
}

// ============================================================================
// LOGGER IMPLEMENTATION
// ============================================================================

let currentLogLevel: LogLevel = LogLevel.INFO;

/**
 * Sets the current log level
 *
 * @param level - The log level to set
 */
function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Internal logging function
 *
 * @param level - The log level
 * @param message - The log message
 * @param context - Optional context object
 */
function log(level: LogLevel, message: string, context: LoggerContext = {}): void {
  if (level >= currentLogLevel) {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    // Separate log calls to prevent browser DevTools from showing raw context object
    console.log(`[${timestamp}] [${levelName}] ${message}`);
    if (Object.keys(context).length > 0) {
      const sanitizedContext = sanitizeContext(context);
      console.log('Context:', sanitizedContext);
    }
  }
}

/**
 * Sanitizes context object by masking sensitive fields recursively
 * Handles nested objects and arrays to ensure API keys are never logged
 *
 * @param context - The context object to sanitize
 * @param depth - Current recursion depth (prevents infinite recursion)
 * @returns Sanitized context object
 */
function sanitizeContext(context: LoggerContext, depth: number = 0): SanitizedContext {
  const MAX_DEPTH = 10;

  if (!context || typeof context !== 'object') return context;
  if (depth > MAX_DEPTH) return '[Max depth reached]';

  const sanitized: SanitizedContext = {};
  const keyPatterns = ['key', 'token', 'password', 'secret'];

  for (const [key, value] of Object.entries(context)) {
    const isSensitive = keyPatterns.some((pattern) => key.toLowerCase().includes(pattern));

    if (isSensitive) {
      // Mask sensitive values
      sanitized[key] = maskApiKey(value);
    } else if (Array.isArray(value)) {
      // Recursively sanitize array elements
      sanitized[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? sanitizeContext(item as LoggerContext, depth + 1)
          : item
      );
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeContext(value as LoggerContext, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Logger instance with typed methods
 */
export const logger: Logger = {
  debug: (msg: string, ctx?: LoggerContext): void => log(LogLevel.DEBUG, msg, ctx),
  info: (msg: string, ctx?: LoggerContext): void => log(LogLevel.INFO, msg, ctx),
  warn: (msg: string, ctx?: LoggerContext): void => log(LogLevel.WARN, msg, ctx),
  error: (msg: string, ctx?: LoggerContext): void => log(LogLevel.ERROR, msg, ctx),
  setLogLevel,
};

// ============================================================================
// ERROR DISPLAY HELPERS
// ============================================================================

/**
 * Logs an error and sends it to the UI for display
 * This is the standard error handling function for the entire application
 *
 * @param error - The error to handle (can be Error, string, or unknown)
 * @param type - Error type for categorization
 * @param context - Additional context information
 * @param customMessage - Optional custom message to override the error message
 */
export function logAndDisplayError(
  error: unknown,
  type: ErrorType = ErrorType.SYSTEM,
  context: LoggerContext = {},
  customMessage?: string
): void {
  // Extract error message
  const errorMessage = customMessage || (error instanceof Error ? error.message : String(error));

  // Determine severity based on error type and content
  const severity = determineErrorSeverity(error, type);

  // Create error display object
  const errorDisplay: ErrorDisplay = {
    message: errorMessage,
    severity,
    type,
    context,
  };

  // Log the error with full context
  logger.error(`[${type.toUpperCase()}] ${errorMessage}`, {
    ...context,
    severity,
    errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
  });

  // Send error to UI via runtime message
  sendErrorToUI(errorDisplay).catch((sendError) => {
    logger.error('Failed to send error to UI', {
      originalError: errorMessage,
      sendError: sendError instanceof Error ? sendError.message : String(sendError),
    });
  });
}

/**
 * Determines error severity based on error type and content
 *
 * @param error - The error to evaluate
 * @param type - Error type
 * @returns Appropriate severity level
 */
function determineErrorSeverity(error: unknown, type: ErrorType): ErrorSeverity {
  const errorMessage =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // CRITICAL errors
  if (type === ErrorType.SYSTEM) {
    return ErrorSeverity.CRITICAL;
  }
  if (errorMessage.includes('permission')) {
    return ErrorSeverity.CRITICAL;
  }
  if (errorMessage.includes('configuration')) {
    return ErrorSeverity.CRITICAL;
  }

  // WARNING errors
  if (type === ErrorType.NETWORK || type === ErrorType.API) {
    return ErrorSeverity.WARNING;
  }
  if (errorMessage.includes('timeout')) {
    return ErrorSeverity.WARNING;
  }
  if (errorMessage.includes('rate limit')) {
    return ErrorSeverity.WARNING;
  }

  // INFO errors (usually validation or user input issues)
  if (type === ErrorType.VALIDATION || type === ErrorType.USER) {
    return ErrorSeverity.INFO;
  }

  // Default to CRITICAL for unknown errors
  return ErrorSeverity.CRITICAL;
}

/**
 * Sends error display message to UI via runtime API
 * Note: This function works in background script context
 *
 * @param errorDisplay - Error information to display
 */
async function sendErrorToUI(errorDisplay: ErrorDisplay): Promise<void> {
  try {
    // Check if we're in a browser extension context
    // @ts-expect-error - browser runtime API is available in extension context
    if (typeof browser !== 'undefined' && browser.runtime) {
      const message: ShowErrorRuntimeMessage = {
        action: 'showError',
        error: errorDisplay,
      };

      // Try to send message to options page
      // @ts-expect-error - browser runtime sendMessage is valid for WebExtensions
      browser.runtime.sendMessage(message).catch((reason: unknown) => {
        // Options page might not be open, this is acceptable
        const errorMsg = reason instanceof Error ? reason.message : String(reason);
        if (!errorMsg.includes('Receiving end does not exist')) {
          logger.warn('Failed to send error to UI', { error: errorMsg });
        }
      });
    }
  } catch (error) {
    // Runtime API not available (not in extension context)
    logger.debug('Runtime API not available for error display');
  }
}

// ============================================================================
// JSON EXTRACTION
// ============================================================================

/**
 * Type guard for unknown data being a string
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Extracts the first valid JSON object from a text string
 * Handles nested objects by counting braces
 *
 * @param text - Text potentially containing JSON
 * @returns Extracted JSON string
 * @throws {Error} If no valid JSON object is found
 *
 * @example
 * extractJson('Here is some text {"key": "value"} more text') // Returns '{"key": "value"}'
 * extractJson('{"nested": {"deep": true}}') // Returns '{"nested": {"deep": true}}'
 */
export function extractJson(text: unknown): string {
  if (!isString(text)) {
    throw new Error('Input must be a string');
  }

  let firstBrace = -1;
  let braceCount = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (firstBrace === -1) firstBrace = i;
      braceCount++;
    } else if (text[i] === '}') {
      braceCount--;
      if (braceCount === 0 && firstBrace !== -1) {
        return text.substring(firstBrace, i + 1);
      }
    }
  }

  throw new Error('Could not find a valid JSON object in the response.');
}

// ============================================================================
// RETRY WITH BACKOFF
// ============================================================================

/**
 * Checks if an error is a transient (retryable) error
 * Transient errors include network errors and connection resets
 *
 * @param error - The error to check
 * @returns True if the error is transient
 */
function isTransientError(error: unknown): boolean {
  if (!isError(error)) return false;

  if (error.name === 'TypeError' && error.message.includes('fetch')) return true;
  if (error.name === 'NetworkError') return true;

  if (isErrorWithCause(error)) {
    const code = error.cause?.code;
    if (code === 'ECONNRESET' || code === 'ECONNREFUSED') return true;
  }

  return false;
}

/**
 * Checks if an HTTP status code is retryable
 * Retryable statuses: 5xx, 408 (Request Timeout), 429 (Too Many Requests)
 *
 * @param status - HTTP status code
 * @returns True if the status is retryable
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/**
 * Type guard for objects with status property
 */
function hasStatus(obj: unknown): obj is { status: number } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'status' in obj &&
    typeof (obj as { status: unknown }).status === 'number'
  );
}

/**
 * Retries an async function with exponential backoff and jitter
 *
 * @template T - Return type of the function
 * @param fn - Async function to retry
 * @param options - Retry configuration options
 * @returns Promise resolving to the function result
 * @throws The last error if all retries are exhausted
 *
 * @example
 * await retryWithBackoff(() => fetch('/api/data'), { maxRetries: 3 })
 *
 * @example
 * await retryWithBackoff(() => fetchData(), {
 *   maxRetries: 5,
 *   baseDelay: 2000,
 *   factor: 2,
 *   jitter: 0.3
 * })
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryConfig<T> = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, factor = 2, jitter = 0.5 } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      // Check if result has retryable status
      if (hasStatus(result) && isRetryableStatus(result.status)) {
        throw new Error(`HTTP ${result.status}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      const hasErrorStatus =
        isError(error) && typeof (error as unknown as { status?: unknown }).status === 'number';
      const status = hasErrorStatus ? (error as unknown as { status: number }).status : null;
      const isTransient = isTransientError(error) || (status !== null && isRetryableStatus(status));

      if (attempt === maxRetries || !isTransient) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = baseDelay * Math.pow(factor, attempt);
      const jitterAmount = exponentialDelay * jitter * (Math.random() * 2 - 1);
      const delay = exponentialDelay + jitterAmount;

      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, delay)));
    }
  }

  throw lastError;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Logs validation errors
 *
 * @param message - Error message
 * @param details - Additional error details
 */
function logError(message: string, details: LoggerContext = {}): void {
  logger.error(`[Validation Error] ${message}`, details);
}

/**
 * Validates and sanitizes a value against a schema definition
 *
 * @template T - Expected type of the value
 * @param value - The value to validate
 * @param schema - Schema definition
 * @param fieldName - Name of the field being validated
 * @returns Validated and sanitized value
 */
function validateValue<T>(value: unknown, schema: SchemaField<T>, fieldName: string): T {
  // Handle missing/undefined values
  if (value === undefined || value === null) {
    if (schema.required) {
      logError(`Missing required field: ${fieldName}`, { received: value });
    }
    return schema.default;
  }

  // Type validation and conversion
  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') {
        logError(`Type mismatch for ${fieldName}: expected string`, {
          received: typeof value,
        });
        return schema.default;
      }
      return value as T;
    }

    case 'number': {
      let numValue: number;

      if (typeof value !== 'number') {
        const converted = Number(value);
        if (isNaN(converted)) {
          logError(`Type mismatch for ${fieldName}: expected number`, {
            received: typeof value,
          });
          return schema.default;
        }
        numValue = converted;
      } else {
        numValue = value;
      }

      if (schema.validate && !schema.validate(numValue as unknown)) {
        logError(`Validation failed for ${fieldName}`, { received: numValue });
        return schema.default;
      }

      return numValue as T;
    }

    case 'array': {
      if (!Array.isArray(value)) {
        logError(`Type mismatch for ${fieldName}: expected array`, {
          received: typeof value,
        });
        return schema.default;
      }

      return value as T;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        logError(`Type mismatch for ${fieldName}: expected boolean`, {
          received: typeof value,
        });
        return schema.default;
      }

      return value as T;
    }

    default:
      return schema.default;
  }
}

/**
 * Type guard for parsed JSON object
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates an LLM response against the Tag schema
 * Handles JSON parsing errors, schema validation, and fallbacks
 *
 * @param response - Raw response (string or already parsed object)
 * @returns Validated response with fallback values
 *
 * @example
 * validateLLMResponse('{"tags": ["work", "urgent"], "confidence": 0.8}')
 * // Returns { tags: ["work", "urgent"], confidence: 0.8, reasoning: "" }
 *
 * @example
 * validateLLMResponse('Some text {"tags": ["personal"]} more text')
 * // Returns { tags: ["personal"], confidence: 0.5, reasoning: "" }
 *
 * @example
 * validateLLMResponse('invalid json')
 * // Returns { tags: [], confidence: 0.5, reasoning: "" }
 */
export function validateLLMResponse(response: unknown): TagResponse {
  let parsed: Record<string, unknown>;

  // Parse JSON if response is a string
  if (isString(response)) {
    try {
      // First try to extract JSON if it's embedded in text
      const jsonText = extractJson(response);
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch (error) {
      // Fallback: try parsing the whole string as JSON
      try {
        parsed = JSON.parse(response) as Record<string, unknown>;
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        logError('Failed to parse JSON response', {
          error: errorMessage,
          response: response.substring(0, 200),
        });
        // Return fallback response
        return {
          tags: [],
          confidence: 0.5,
          reasoning: '',
        };
      }
    }
  } else if (isJsonObject(response)) {
    parsed = response;
  } else {
    logError('Invalid response type', { type: typeof response });
    return {
      tags: [],
      confidence: 0.5,
      reasoning: '',
    };
  }

  // Validate each field against schema
  const validated = {} as TagResponse;
  for (const [fieldName, schema] of Object.entries(TAG_RESPONSE_SCHEMA)) {
    validated[fieldName as keyof TagResponse] = validateValue(
      parsed[fieldName] as unknown,
      schema,
      fieldName
    );
  }

  return validated;
}

// ============================================================================
// APP CONFIG VALIDATION
// ============================================================================

/**
 * Type guard for checking if a value is a valid CustomTags array
 * @param value - Value to check
 * @returns True if value is a valid CustomTags array
 */
function isCustomTags(value: unknown): value is CustomTags {
  if (!Array.isArray(value)) return false;

  for (const item of value) {
    if (typeof item !== 'object' || item === null) return false;
    const tag = item as Record<string, unknown>;

    if (typeof tag.key !== 'string' || tag.key.trim().length === 0) return false;
    if (typeof tag.name !== 'string' || tag.name.trim().length === 0) return false;
    if (typeof tag.color !== 'string' || !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(tag.color))
      return false;
    // prompt is optional
  }

  return true;
}

/**
 * Validates and sanitizes a partial AppConfig from storage
 * @param result - Storage result to validate
 * @returns Validated Partial<AppConfig> with fallback values for invalid fields
 */
export function validateAppConfig(result: Record<string, unknown>): Partial<AppConfig> {
  const validated: Partial<AppConfig> = {};

  // Validate provider (string, must be valid provider)
  if (typeof result.provider === 'string') {
    const { Provider } = require('../core/config');
    if (Object.values(Provider).includes(result.provider as any)) {
      validated.provider = result.provider as any;
    }
  }

  // Validate boolean fields
  if (typeof result.enableNotifications === 'boolean') {
    validated.enableNotifications = result.enableNotifications;
  }
  if (typeof result.enableLogging === 'boolean') {
    validated.enableLogging = result.enableLogging;
  }

  // Validate API key fields (strings)
  if (typeof result.openaiApiKey === 'string') {
    validated.openaiApiKey = result.openaiApiKey;
  }
  if (typeof result.geminiApiKey === 'string') {
    validated.geminiApiKey = result.geminiApiKey;
  }
  if (typeof result.claudeApiKey === 'string') {
    validated.claudeApiKey = result.claudeApiKey;
  }
  if (typeof result.mistralApiKey === 'string') {
    validated.mistralApiKey = result.mistralApiKey;
  }
  if (typeof result.deepseekApiKey === 'string') {
    validated.deepseekApiKey = result.deepseekApiKey;
  }
  if (typeof result.zaiApiKey === 'string') {
    validated.zaiApiKey = result.zaiApiKey;
  }

  // Validate string fields (URLs, models)
  if (typeof result.ollamaApiUrl === 'string') {
    validated.ollamaApiUrl = result.ollamaApiUrl;
  }
  if (typeof result.ollamaModel === 'string') {
    validated.ollamaModel = result.ollamaModel;
  }
  if (typeof result.zaiBaseUrl === 'string') {
    validated.zaiBaseUrl = result.zaiBaseUrl;
  }
  if (typeof result.zaiModel === 'string') {
    validated.zaiModel = result.zaiModel;
  }

  // Validate zaiVariant (must be 'paas' or 'coding')
  if (result.zaiVariant === 'paas' || result.zaiVariant === 'coding') {
    validated.zaiVariant = result.zaiVariant;
  }

  // Validate customTags (array of Tag objects)
  if (isCustomTags(result.customTags)) {
    validated.customTags = result.customTags;
  }

  return validated;
}

/**
 * Validates customTags storage result
 * @param result - Storage result containing customTags
 * @returns Validated customTags or default if invalid
 */
export function validateCustomTagsResult(result: Record<string, unknown>): {
  customTags: CustomTags;
} {
  if (isCustomTags(result.customTags)) {
    return { customTags: result.customTags };
  }

  const { DEFAULT_CUSTOM_TAGS } = require('../core/config');
  return { customTags: DEFAULT_CUSTOM_TAGS };
}

// ============================================================================
// REQUEST BODY VALIDATION
// ============================================================================

/**
 * Validates that a value is a valid RequestBody (non-null object)
 * @param payload - Payload to validate
 * @returns Validated RequestBody
 * @throws {Error} If payload is invalid
 */
export function validateRequestBody(payload: unknown): RequestBody {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('RequestBody must be a non-null object');
  }

  return payload as Record<string, unknown>;
}

// ============================================================================
// DEBOUNCE UTILITY
// ============================================================================

/**
 * Creates a debounced version of a function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 *
 * @template T - Function type to debounce
 * @param func - Function to debounce
 * @param wait - Delay in milliseconds
 * @returns Debounced function
 *
 * @example
 * const debouncedSearch = debounce((query: string) => searchAPI(query), 500);
 * inputElement.addEventListener('input', () => debouncedSearch(inputElement.value));
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => func.apply(this, args), wait);
  };
}

// ============================================================================
// TYPE GUARDS FOR COMMON TYPES
// ============================================================================

/**
 * Type guard for BatchAnalysisProgress
 * @param value - Value to check
 * @returns True if value is a valid BatchAnalysisProgress
 */
export function isBatchAnalysisProgress(value: unknown): value is BatchAnalysisProgress {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;
  const validStatuses = ['idle', 'running', 'completed', 'cancelled', 'error'];

  return (
    typeof obj.status === 'string' &&
    validStatuses.includes(obj.status) &&
    typeof obj.total === 'number' &&
    typeof obj.processed === 'number' &&
    typeof obj.successful === 'number' &&
    typeof obj.failed === 'number' &&
    typeof obj.startTime === 'number'
  );
}

// Import BatchAnalysisProgress type for type guard
type BatchAnalysisProgress = {
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  total: number;
  processed: number;
  successful: number;
  failed: number;
  startTime: number;
  endTime?: number;
  errorMessage?: string;
};
