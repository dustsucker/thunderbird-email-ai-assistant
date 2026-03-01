import { InvalidApiKeyError } from '../errors/ValueObjectErrors';

/**
 * Value Object for API Key
 * Immutable value object representing a validated API key with masking support
 *
 * @example
 * const apiKey = new ApiKey('sk-proj-abc123def456', 'openai');
 * console.log(apiKey.value);   // 'sk-proj-abc123def456'
 * console.log(apiKey.masked);  // 'sk-p***f456'
 * console.log(apiKey.toString()); // 'sk-p***f456' (never logs full key)
 */
export class ApiKey {
  /** The actual API key value (never log this directly) */
  readonly value: string;

  /** The provider this key is for (optional, for error messages) */
  readonly provider?: string;

  /** Minimum required length for API keys */
  private static readonly MIN_LENGTH = 8;

  /** Maximum allowed length for API keys */
  private static readonly MAX_LENGTH = 256;

  constructor(value: string, provider?: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      throw new InvalidApiKeyError('API key cannot be empty', provider);
    }

    if (trimmed.length < ApiKey.MIN_LENGTH) {
      throw new InvalidApiKeyError(
        `API key must be at least ${ApiKey.MIN_LENGTH} characters long`,
        provider
      );
    }

    if (trimmed.length > ApiKey.MAX_LENGTH) {
      throw new InvalidApiKeyError(
        `API key exceeds maximum length of ${ApiKey.MAX_LENGTH} characters`,
        provider
      );
    }

    // Check for obviously invalid characters (whitespace, control chars)
    // eslint-disable-next-line no-control-regex
    if (/[\s\x00-\x1F\x7F]/.test(trimmed)) {
      throw new InvalidApiKeyError('API key contains invalid characters', provider);
    }

    this.value = trimmed;
    this.provider = provider;
  }

  /**
   * Returns a masked version of the API key for safe logging
   * @example
   * new ApiKey('sk-proj-abc123def456').masked // 'sk-p***f456'
   * new ApiKey('short').masked // 'sho***'
   */
  get masked(): string {
    if (this.value.length <= 8) {
      return this.value.slice(0, 2) + '***';
    }
    if (this.value.length <= 16) {
      return this.value.slice(0, 4) + '***' + this.value.slice(-3);
    }
    return this.value.slice(0, 4) + '***' + this.value.slice(-4);
  }

  /**
   * Checks if the key has a common prefix pattern
   */
  hasPrefix(prefix: string): boolean {
    return this.value.startsWith(prefix);
  }

  /**
   * Checks if this is likely an OpenAI key
   */
  isOpenAI(): boolean {
    return this.value.startsWith('sk-');
  }

  /**
   * Checks if this is likely a Gemini key
   */
  isGemini(): boolean {
    return this.value.startsWith('AIza');
  }

  /**
   * Checks if this is likely a Claude/Anthropic key
   */
  isClaude(): boolean {
    return this.value.startsWith('sk-ant-');
  }

  /**
   * Checks equality with another ApiKey
   */
  equals(other: ApiKey): boolean {
    return this.value === other.value;
  }

  /**
   * NEVER log the actual value - always return masked version
   */
  toString(): string {
    return this.masked;
  }

  /**
   * NEVER serialize the actual value - always return masked version
   */
  toJSON(): string {
    return this.masked;
  }

  /**
   * Static factory method for validation without throwing
   * @returns true if the key is valid, false otherwise
   */
  static isValid(key: string): boolean {
    try {
      new ApiKey(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safe factory method that returns null instead of throwing
   * @returns ApiKey instance or null if invalid
   */
  static tryCreate(key: string, provider?: string): ApiKey | null {
    try {
      return new ApiKey(key, provider);
    } catch {
      return null;
    }
  }

  /**
   * Creates an empty/placeholder API key for initialization
   * Note: This creates an invalid key that will fail validation if used
   */
  static empty(): ApiKey {
    // Use Object.assign to bypass constructor validation
    const emptyKey = Object.create(ApiKey.prototype) as ApiKey;
    Object.assign(emptyKey, {
      value: '',
      provider: undefined,
    });
    return emptyKey;
  }

  /**
   * Checks if this is an empty/placeholder key
   */
  isEmpty(): boolean {
    return this.value === '';
  }
}
