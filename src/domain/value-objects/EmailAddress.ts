import { InvalidEmailAddressError } from '../errors/ValueObjectErrors';

/**
 * Value Object for Email Address
 * Immutable value object representing a valid email address
 *
 * @example
 * const email = new EmailAddress('User@Example.COM');
 * console.log(email.value);      // 'user@example.com' (normalized)
 * console.log(email.domain);     // 'example.com'
 * console.log(email.localPart);  // 'user'
 */
export class EmailAddress {
  /** The normalized email address (lowercase, trimmed) */
  readonly value: string;

  /** RFC 5322 simplified regex pattern */
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /** Maximum total length per RFC 5321 */
  private static readonly MAX_LENGTH = 254;

  /** Maximum local part length per RFC 5321 */
  private static readonly MAX_LOCAL_LENGTH = 64;

  constructor(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      throw new InvalidEmailAddressError(value, 'Email address cannot be empty');
    }

    if (trimmed.length > EmailAddress.MAX_LENGTH) {
      throw new InvalidEmailAddressError(
        value,
        `Email address exceeds maximum length of ${EmailAddress.MAX_LENGTH} characters`
      );
    }

    // Normalize to lowercase for consistency
    const normalized = trimmed.toLowerCase();

    if (!this.isValid(normalized)) {
      throw new InvalidEmailAddressError(value, 'Must be in format: local@domain.tld');
    }

    // Validate local part length
    const localPart = normalized.split('@')[0];
    if (localPart.length > EmailAddress.MAX_LOCAL_LENGTH) {
      throw new InvalidEmailAddressError(
        value,
        `Local part exceeds maximum length of ${EmailAddress.MAX_LOCAL_LENGTH} characters`
      );
    }

    this.value = normalized;
  }

  /**
   * Validates email format using simplified RFC 5322 regex
   */
  private isValid(email: string): boolean {
    return EmailAddress.EMAIL_REGEX.test(email);
  }

  /**
   * Gets the domain part of the email (after @)
   */
  get domain(): string {
    return this.value.split('@')[1] ?? '';
  }

  /**
   * Gets the local part of the email (before @)
   */
  get localPart(): string {
    return this.value.split('@')[0] ?? '';
  }

  /**
   * Checks if email is from a specific domain
   */
  isFromDomain(domain: string): boolean {
    return this.domain.toLowerCase() === domain.toLowerCase();
  }

  /**
   * Checks if this email equals another (case-insensitive)
   */
  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }

  /**
   * Returns the email address as a string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Returns the email address for JSON serialization
   */
  toJSON(): string {
    return this.value;
  }

  /**
   * Static factory method for validation without throwing
   * @returns true if the email is valid, false otherwise
   */
  static isValid(email: string): boolean {
    try {
      new EmailAddress(email);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safe factory method that returns null instead of throwing
   * @returns EmailAddress instance or null if invalid
   */
  static tryCreate(email: string): EmailAddress | null {
    try {
      return new EmailAddress(email);
    } catch {
      return null;
    }
  }

  /**
   * Creates EmailAddress or returns a default
   * @param email - The email string to parse
   * @param fallback - The fallback value if invalid
   */
  static createOr(email: string, fallback: EmailAddress): EmailAddress {
    try {
      return new EmailAddress(email);
    } catch {
      return fallback;
    }
  }
}
