/**
 * Logging utilities for sanitizing sensitive data
 * @module shared/utils/loggingUtils
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Context object that may contain sensitive data
 */
export type LogContext = Record<string, unknown>;

/**
 * Sensitive field patterns to mask
 */
const SENSITIVE_PATTERNS = [
  'apikey',
  'api_key',
  'api-key',
  'key',
  'token',
  'password',
  'secret',
  'credential',
  'auth',
  'authorization',
  'private',
] as const;

/**
 * URL-sensitive query parameter patterns
 */
const URL_SENSITIVE_PARAMS = ['key', 'token', 'api_key', 'apikey', 'secret', 'password'];

// ============================================================================
// MASKING FUNCTIONS
// ============================================================================

/**
 * Masks an API key or sensitive value for safe logging.
 * Shows first 7 and last 3 characters with ellipsis in between.
 *
 * @param value - The value to mask
 * @returns Masked value string
 *
 * @example
 * maskSensitiveValue('sk-1234567890abcdef') // Returns 'sk-1234...def'
 * maskSensitiveValue('short') // Returns '***'
 * maskSensitiveValue(null) // Returns 'not set'
 */
export function maskSensitiveValue(value: unknown): string {
  if (!value || typeof value !== 'string') return 'not set';
  if (value.length <= 10) return '***';
  return value.slice(0, 7) + '...' + value.slice(-3);
}

/**
 * Masks sensitive query parameters in a URL.
 *
 * @param url - The URL string to sanitize
 * @returns URL with sensitive query params masked
 *
 * @example
 * maskSensitiveUrlParams('https://api.example.com?key=secret123')
 * // Returns 'https://api.example.com?key=***'
 */
export function maskSensitiveUrlParams(url: string): string {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    for (const param of URL_SENSITIVE_PARAMS) {
      if (params.has(param)) {
        params.set(param, '***');
      }
    }

    return urlObj.toString();
  } catch {
    // If URL parsing fails, return masked
    return '[invalid-url]';
  }
}

/**
 * Checks if a field name is sensitive based on patterns.
 *
 * @param fieldName - The field name to check
 * @returns True if the field is sensitive
 */
function isSensitiveField(fieldName: string): boolean {
  const lowerField = fieldName.toLowerCase();
  return SENSITIVE_PATTERNS.some((pattern) => lowerField.includes(pattern));
}

/**
 * Checks if a value is a URL string that might contain sensitive params.
 *
 * @param value - The value to check
 * @returns True if value looks like a URL with query params
 */
function isUrlWithParams(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.includes('?') && (value.startsWith('http://') || value.startsWith('https://'));
}

// ============================================================================
// MAIN SANITIZATION FUNCTION
// ============================================================================

/**
 * Recursively sanitizes an object for safe logging by masking sensitive fields.
 *
 * This function handles:
 * - API keys, tokens, passwords, secrets (any field containing these patterns)
 * - URLs with sensitive query parameters
 * - Nested objects and arrays
 * - Circular reference protection via depth limit
 *
 * @param data - The data to sanitize (object, array, or primitive)
 * @param depth - Current recursion depth (default 0)
 * @returns Sanitized copy of the data
 *
 * @example
 * sanitizeForLogging({ apiKey: 'sk-secret123', model: 'gpt-4' })
 * // Returns { apiKey: 'sk-secr...23', model: 'gpt-4' }
 *
 * @example
 * sanitizeForLogging({
 *   config: { api_key: 'secret', name: 'test' },
 *   url: 'https://api.example.com?key=secret'
 * })
 * // Returns {
 * //   config: { api_key: '***', name: 'test' },
 * //   url: 'https://api.example.com?key=***'
 * // }
 */
export function sanitizeForLogging(data: unknown, depth: number = 0): unknown {
  const MAX_DEPTH = 10;

  // Handle primitives and null
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    // Check if it's a URL with sensitive params
    if (typeof data === 'string' && isUrlWithParams(data)) {
      return maskSensitiveUrlParams(data);
    }
    return data;
  }

  // Prevent infinite recursion
  if (depth > MAX_DEPTH) {
    return '[max-depth-reached]';
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLogging(item, depth + 1));
  }

  // Handle objects
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveField(key)) {
      // Mask sensitive fields
      sanitized[key] = maskSensitiveValue(value);
    } else if (typeof value === 'string' && isUrlWithParams(value)) {
      // Sanitize URLs with query params
      sanitized[key] = maskSensitiveUrlParams(value);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeForLogging(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Creates a sanitized copy of provider settings for logging.
 * Specifically designed for BaseProviderSettings objects.
 *
 * @param settings - Provider settings object
 * @returns Sanitized settings safe for logging
 *
 * @example
 * const sanitized = sanitizeSettingsForLogging({
 *   apiKey: 'sk-secret123',
 *   apiUrl: 'https://api.example.com',
 *   model: 'gpt-4'
 * });
 * // Returns { apiKey: 'sk-secr...23', apiUrl: 'https://api.example.com', model: 'gpt-4' }
 */
export function sanitizeSettingsForLogging(
  settings: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeForLogging(settings) as Record<string, unknown>;
}

/**
 * Validates API key format with basic checks.
 * Does NOT log the actual key - only returns validation result.
 *
 * @param apiKey - The API key to validate
 * @param options - Validation options
 * @returns Validation result with error message if invalid
 */
export function validateApiKeyFormat(
  apiKey: unknown,
  options: {
    /** Minimum required length */
    minLength?: number;
    /** Expected prefix (e.g., 'sk-' for OpenAI) */
    expectedPrefix?: string;
    /** Provider name for error messages */
    providerName?: string;
  } = {}
): { valid: boolean; error?: string } {
  const { minLength = 10, expectedPrefix, providerName = 'Provider' } = options;

  // Check if key exists
  if (!apiKey) {
    return { valid: false, error: `${providerName} API key is required` };
  }

  // Check if it's a string
  if (typeof apiKey !== 'string') {
    return { valid: false, error: `${providerName} API key must be a string` };
  }

  // Check for empty string
  const trimmedKey = apiKey.trim();
  if (trimmedKey.length === 0) {
    return { valid: false, error: `${providerName} API key cannot be empty` };
  }

  // Check minimum length
  if (trimmedKey.length < minLength) {
    return {
      valid: false,
      error: `${providerName} API key is too short (minimum ${minLength} characters)`,
    };
  }

  // Check expected prefix
  if (expectedPrefix && !trimmedKey.startsWith(expectedPrefix)) {
    return {
      valid: false,
      error: `${providerName} API key should start with "${expectedPrefix}"`,
    };
  }

  return { valid: true };
}
