/**
 * Custom Error Classes for Value Objects
 * Provides type-safe, descriptive errors for domain validation failures
 */

/**
 * Error thrown when an email address is invalid
 */
export class InvalidEmailAddressError extends Error {
  readonly value: string;

  constructor(value: string, reason?: string) {
    const message = reason
      ? `Invalid email address "${value}": ${reason}`
      : `Invalid email address: "${value}"`;
    super(message);
    this.name = 'InvalidEmailAddressError';
    this.value = value;
    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidEmailAddressError);
    }
  }
}

/**
 * Error thrown when an API key is invalid
 */
export class InvalidApiKeyError extends Error {
  readonly provider?: string;

  constructor(message: string, provider?: string) {
    const fullMessage = provider
      ? `Invalid API key for ${provider}: ${message}`
      : `Invalid API key: ${message}`;
    super(fullMessage);
    this.name = 'InvalidApiKeyError';
    this.provider = provider;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidApiKeyError);
    }
  }
}

/**
 * Error thrown when a tag color is invalid
 */
export class InvalidTagColorError extends Error {
  readonly value: string;

  constructor(value: string, reason?: string) {
    const message = reason
      ? `Invalid tag color "${value}": ${reason}`
      : `Invalid tag color: "${value}"`;
    super(message);
    this.name = 'InvalidTagColorError';
    this.value = value;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidTagColorError);
    }
  }
}

/**
 * Error thrown when a tag key is invalid
 */
export class InvalidTagKeyError extends Error {
  readonly value: string;

  constructor(value: string, reason?: string) {
    const message = reason
      ? `Invalid tag key "${value}": ${reason}`
      : `Invalid tag key: "${value}"`;
    super(message);
    this.name = 'InvalidTagKeyError';
    this.value = value;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidTagKeyError);
    }
  }
}

/**
 * Type guard to check if an error is an InvalidEmailAddressError
 */
export function isInvalidEmailAddressError(error: unknown): error is InvalidEmailAddressError {
  return error instanceof InvalidEmailAddressError;
}

/**
 * Type guard to check if an error is an InvalidApiKeyError
 */
export function isInvalidApiKeyError(error: unknown): error is InvalidApiKeyError {
  return error instanceof InvalidApiKeyError;
}

/**
 * Type guard to check if an error is an InvalidTagColorError
 */
export function isInvalidTagColorError(error: unknown): error is InvalidTagColorError {
  return error instanceof InvalidTagColorError;
}

/**
 * Type guard to check if an error is an InvalidTagKeyError
 */
export function isInvalidTagKeyError(error: unknown): error is InvalidTagKeyError {
  return error instanceof InvalidTagKeyError;
}
