// ============================================================================
// Domain Interface: IRandom
// ============================================================================
// This interface defines the random value generation contract for the Domain layer.
// Infrastructure layer provides concrete implementations (e.g., CryptoRandom).
//
// IMPORTANT: This is the canonical location for IRandom.
// All layers should import from here: @/domain/interfaces/IRandom
// ============================================================================

/**
 * Interface for random value generation.
 *
 * Allows injecting deterministic generators for testing, enabling
 * predictable random values in tests without relying on system randomness.
 *
 * @example
 * // In production, use CryptoRandom
 * container.registerSingleton<IRandom>('IRandom', CryptoRandom);
 *
 * // In tests, use a mock
 * const mockRandom = { uuid: () => 'mock-uuid-1', randomInt: () => 0 };
 */
export interface IRandom {
  /**
   * Generates a UUID v4 string.
   *
   * Uses cryptographically secure random generation in production.
   * Returns deterministic values in test mocks.
   *
   * @returns A UUID v4 string (e.g., "550e8400-e29b-41d4-a716-446655440000")
   *
   * @example
   * const id = random.uuid(); // e.g., "550e8400-e29b-41d4-a716-446655440000"
   */
  uuid(): string;

  /**
   * Generates a random integer between min and max (inclusive).
   *
   * @param min - The minimum value (inclusive)
   * @param max - The maximum value (inclusive)
   * @returns A random integer between min and max
   *
   * @example
   * const roll = random.randomInt(1, 6); // Dice roll: 1-6
   * const index = random.randomInt(0, array.length - 1); // Random array index
   */
  randomInt(min: number, max: number): number;
}
