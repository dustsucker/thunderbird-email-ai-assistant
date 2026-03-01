/**
 * Cryptographic random implementation of the IRandom interface.
 *
 * Provides secure random value generation using the crypto module.
 * This is the production implementation that should be used at runtime.
 *
 * @module infrastructure/system/CryptoRandom
 */

import { injectable } from 'tsyringe';
import { randomUUID } from 'crypto';
import type { IRandom } from '@/domain/interfaces/IRandom';

/**
 * CryptoRandom provides cryptographically secure random values.
 *
 * This implementation uses Node.js crypto module for UUID generation
 * and Math.random for integer generation. For testing, use a mock
 * implementation of IRandom instead.
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
   * Generates a UUID v4 string using cryptographically secure randomness.
   *
   * @returns A UUID v4 string
   */
  uuid(): string {
    return randomUUID();
  }

  /**
   * Generates a random integer between min and max (inclusive).
   *
   * Uses Math.random() for generation. For cryptographic security,
   * consider using crypto.randomInt() in Node.js environments.
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
    // Math.random() returns [0, 1), so we need to add 1 to include max
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
