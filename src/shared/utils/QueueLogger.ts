/**
 * Queue Logger Utility
 *
 * Provides shared queue status logging functionality to eliminate code duplication.
 *
 * @module shared/utils/QueueLogger
 */

import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IQueue } from '@/infrastructure/interfaces/IQueue';

/**
 * Logs current queue status for monitoring.
 *
 * @param logger - Logger instance to log to
 * @param queue - Queue instance to get stats from
 * @param context - Optional context string to add to the log entry
 * @returns Promise resolving when logging is complete
 */
export async function logQueueStatus(
  logger: ILogger,
  queue: IQueue,
  context?: string
): Promise<void> {
  const stats = await queue.getStats();
  logger.info('Queue status', {
    ...(context && { context }),
    size: stats.size,
    waiting: stats.waiting,
    processing: stats.processing,
    avgWaitTime: stats.avgWaitTime,
  });
}
