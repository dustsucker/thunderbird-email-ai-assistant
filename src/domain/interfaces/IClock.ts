// ============================================================================
// Domain Interface: IClock
// ============================================================================
// This interface defines the time-based operations contract for the Domain layer.
// Infrastructure layer provides concrete implementations (e.g., SystemClock).
//
// IMPORTANT: This is the canonical location for IClock.
// All layers should import from here: @/domain/interfaces/IClock
// ============================================================================

/**
 * Interface for time-based operations.
 *
 * Allows injecting mock clocks for testing, enabling deterministic
 * time-dependent behavior in tests without relying on system time.
 *
 * @example
 * // In production, use SystemClock
 * container.registerSingleton<IClock>('IClock', SystemClock);
 *
 * // In tests, use a mock
 * const mockClock = { now: () => 1000000, currentDate: () => new Date(1000000) };
 */
export interface IClock {
  /**
   * Returns the current timestamp in milliseconds since epoch.
   *
   * This is equivalent to `Date.now()` but allows for injection
   * and mocking in tests.
   *
   * @returns Current timestamp in milliseconds
   *
   * @example
   * const timestamp = clock.now(); // e.g., 1709251200000
   */
  now(): number;

  /**
   * Returns the current Date object.
   *
   * This is equivalent to `new Date()` but allows for injection
   * and mocking in tests.
   *
   * @returns Current Date object
   *
   * @example
   * const date = clock.currentDate(); // e.g., 2024-03-01T00:00:00.000Z
   */
  currentDate(): Date;
}
