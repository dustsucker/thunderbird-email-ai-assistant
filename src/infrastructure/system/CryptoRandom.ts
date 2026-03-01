/**
 * Cryptographic random implementation of the IRandom interface.
 *
 * Provides secure random value generation using the Web Crypto API.
 * This is the production implementation that should be used at runtime.
 *
 * @module infrastructure/system/CryptoRandom
 */

import { injectable } from 'tsyringe';
import type { IRandom } from '@/domain/interfaces/IRandom';

/**
 * CryptoRandom provides cryptographically secure random values.
 *
 * This implementation uses the Web Crypto API (globalThis.crypto) for
 * UUID generation and random values. Works in both browser and Thunderbird
 * WebExtension contexts.
 *
 * @example
 * // Register in DI container
 * container.registerSingleton<IRandom>('IRandom', CryptoRandom);
 *
 * // Inject and use
 * constructor(@inject('IRandom') private readonly random: IRandom) {
 *   const id = this.random.uuid();
 * }
 */
@injectable()
export class CryptoRandom implements IRandom {
  /**
   * Generates a UUID v4 string using the Web Crypto API.
   *
   * @returns A UUID v4 string
   * @throws Error if Web Crypto API is not available
   */
  uuid(): string {
    // Use Web Crypto API (works in browsers and Thunderbird WebExtensions)
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    // Fallback for environments without crypto.randomUUID
    return this.uuidFallback();
  }

  /**
   * Fallback UUID generation using crypto.getRandomValues.
   * Used when randomUUID is not available.
   */
  private uuidFallback(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);

    // Set version (4) and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 1

    // Convert to UUID string format
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /**
   * Generates a random integer between min and max (inclusive).
   *
   * Uses Web Crypto API for cryptographically secure randomness.
   *
   * @param min - The minimum value (inclusive)
   * @param max - The maximum value (inclusive)
   * @returns A random integer between min and max
   */
  randomInt(min: number, max: number): number {
    // Validate inputs
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error('min and max must be integers');
    }
    if (min > max) {
      throw new Error('min must be less than or equal to max');
    }

    // Use crypto.getRandomValues for secure randomness
    const range = max - min + 1;
    const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
    const maxValid = Math.floor(256 ** bytesNeeded / range) * range - 1;

    let randomValue: number;
    const bytes = new Uint8Array(bytesNeeded);

    do {
      globalThis.crypto.getRandomValues(bytes);
      randomValue = bytes.reduce((acc, byte, i) => acc + byte * 256 ** i, 0);
    } while (randomValue > maxValid);

    return min + (randomValue % range);
  }
}
