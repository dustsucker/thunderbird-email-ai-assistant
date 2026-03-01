/**
 * System clock implementation of the IClock interface.
 *
 * Provides real system time using Date.now() and new Date().
 * This is the production implementation that should be used at runtime.
 *
 * @module infrastructure/system/SystemClock
 */

import { injectable } from 'tsyringe';
import type { IClock } from '@/domain/interfaces/IClock';

/**
 * SystemClock provides real system time.
 *
 * This implementation delegates to the native Date object, making it
 * suitable for production use. For testing, use a mock implementation
 * of IClock instead.
 *
 * @example
 * // Register in DI container
 * container.registerSingleton<IClock>('IClock', SystemClock);
 *
 * // Inject and use
 * constructor(@inject('IClock') private readonly clock: IClock) {
 *   const timestamp = this.clock.now();
 * }
 */
@injectable()
export class SystemClock implements IClock {
  /**
   * Returns the current timestamp in milliseconds since epoch.
   *
   * @returns Current timestamp from Date.now()
   */
  now(): number {
    return Date.now();
  }

  /**
   * Returns the current Date object.
   *
   * @returns New Date object representing current time
   */
  currentDate(): Date {
    return new Date();
  }
}
