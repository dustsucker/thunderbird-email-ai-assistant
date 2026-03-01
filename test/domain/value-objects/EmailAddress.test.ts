import { describe, it, expect } from 'vitest';
import {
  EmailAddress,
  InvalidEmailAddressError,
  isInvalidEmailAddressError,
} from '@/domain/value-objects';

describe('EmailAddress', () => {
  describe('constructor', () => {
    it('should create a valid email address', () => {
      const email = new EmailAddress('test@example.com');
      expect(email.value).toBe('test@example.com');
    });

    it('should normalize email to lowercase', () => {
      const email = new EmailAddress('Test@EXAMPLE.COM');
      expect(email.value).toBe('test@example.com');
    });

    it('should trim whitespace', () => {
      const email = new EmailAddress('  test@example.com  ');
      expect(email.value).toBe('test@example.com');
    });

    it('should throw InvalidEmailAddressError for empty string', () => {
      expect(() => new EmailAddress('')).toThrow(InvalidEmailAddressError);
      expect(() => new EmailAddress('   ')).toThrow(InvalidEmailAddressError);
    });

    it('should throw InvalidEmailAddressError for email without @', () => {
      expect(() => new EmailAddress('testexample.com')).toThrow(InvalidEmailAddressError);
    });

    it('should throw InvalidEmailAddressError for email without domain', () => {
      expect(() => new EmailAddress('test@')).toThrow(InvalidEmailAddressError);
    });

    it('should throw InvalidEmailAddressError for email without local part', () => {
      expect(() => new EmailAddress('@example.com')).toThrow(InvalidEmailAddressError);
    });

    it('should throw InvalidEmailAddressError for email without TLD', () => {
      expect(() => new EmailAddress('test@example')).toThrow(InvalidEmailAddressError);
    });

    it('should throw InvalidEmailAddressError for email with spaces', () => {
      expect(() => new EmailAddress('test @example.com')).toThrow(InvalidEmailAddressError);
    });

    it('should throw InvalidEmailAddressError for email exceeding max length', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(() => new EmailAddress(longEmail)).toThrow(InvalidEmailAddressError);
    });
  });

  describe('properties', () => {
    it('should return domain', () => {
      const email = new EmailAddress('user@mail.example.com');
      expect(email.domain).toBe('mail.example.com');
    });

    it('should return local part', () => {
      const email = new EmailAddress('user.name@example.com');
      expect(email.localPart).toBe('user.name');
    });
  });

  describe('isFromDomain', () => {
    it('should return true for matching domain', () => {
      const email = new EmailAddress('user@example.com');
      expect(email.isFromDomain('example.com')).toBe(true);
    });

    it('should return false for non-matching domain', () => {
      const email = new EmailAddress('user@example.com');
      expect(email.isFromDomain('other.com')).toBe(false);
    });

    it('should be case-insensitive', () => {
      const email = new EmailAddress('user@example.com');
      expect(email.isFromDomain('EXAMPLE.COM')).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for same email', () => {
      const email1 = new EmailAddress('test@example.com');
      const email2 = new EmailAddress('test@example.com');
      expect(email1.equals(email2)).toBe(true);
    });

    it('should return true for same email with different case', () => {
      const email1 = new EmailAddress('test@example.com');
      const email2 = new EmailAddress('TEST@EXAMPLE.COM');
      expect(email1.equals(email2)).toBe(true);
    });

    it('should return false for different emails', () => {
      const email1 = new EmailAddress('test@example.com');
      const email2 = new EmailAddress('other@example.com');
      expect(email1.equals(email2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the email value', () => {
      const email = new EmailAddress('test@example.com');
      expect(email.toString()).toBe('test@example.com');
    });
  });

  describe('toJSON', () => {
    it('should return the email value for JSON serialization', () => {
      const email = new EmailAddress('test@example.com');
      expect(email.toJSON()).toBe('test@example.com');
    });
  });

  describe('static isValid', () => {
    it('should return true for valid email', () => {
      expect(EmailAddress.isValid('test@example.com')).toBe(true);
    });

    it('should return false for invalid email', () => {
      expect(EmailAddress.isValid('invalid')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(EmailAddress.isValid('')).toBe(false);
    });
  });

  describe('static tryCreate', () => {
    it('should return EmailAddress for valid email', () => {
      const result = EmailAddress.tryCreate('test@example.com');
      expect(result).toBeInstanceOf(EmailAddress);
      expect(result?.value).toBe('test@example.com');
    });

    it('should return null for invalid email', () => {
      const result = EmailAddress.tryCreate('invalid');
      expect(result).toBeNull();
    });
  });

  describe('static createOr', () => {
    it('should return new EmailAddress for valid email', () => {
      const fallback = new EmailAddress('fallback@example.com');
      const result = EmailAddress.createOr('test@example.com', fallback);
      expect(result.value).toBe('test@example.com');
    });

    it('should return fallback for invalid email', () => {
      const fallback = new EmailAddress('fallback@example.com');
      const result = EmailAddress.createOr('invalid', fallback);
      expect(result).toBe(fallback);
    });
  });
});

describe('InvalidEmailAddressError', () => {
  it('should have correct name', () => {
    try {
      throw new InvalidEmailAddressError('bad@email');
    } catch (error) {
      expect((error as Error).name).toBe('InvalidEmailAddressError');
    }
  });

  it('should include invalid value', () => {
    try {
      throw new InvalidEmailAddressError('bad@email');
    } catch (error) {
      expect((error as InvalidEmailAddressError).value).toBe('bad@email');
    }
  });

  it('should include custom reason in message', () => {
    try {
      throw new InvalidEmailAddressError('bad@email', 'missing @ symbol');
    } catch (error) {
      expect((error as Error).message).toContain('missing @ symbol');
    }
  });
});

describe('isInvalidEmailAddressError', () => {
  it('should return true for InvalidEmailAddressError', () => {
    const error = new InvalidEmailAddressError('bad@email');
    expect(isInvalidEmailAddressError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('regular error');
    expect(isInvalidEmailAddressError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isInvalidEmailAddressError('string')).toBe(false);
    expect(isInvalidEmailAddressError(null)).toBe(false);
    expect(isInvalidEmailAddressError(undefined)).toBe(false);
  });
});
