// ============================================================================
// QUEUE TYPES
// ============================================================================

/**
 * Wrapper type for items stored in the queue with metadata
 *
 * @template T - Type of the queued item
 */
export interface IQueuedItem<T> {
  /** The queued item data */
  item: T;
  /** Priority level (higher = more important) */
  priority: number;
  /** Timestamp when item was enqueued (Unix epoch in milliseconds) */
  enqueuedAt: number;
}

/**
 * Queue statistics snapshot
 */
export interface IQueueStats {
  /** Total number of items in the queue (waiting + processing) */
  size: number;
  /** Number of items waiting to be processed */
  waiting: number;
  /** Number of items currently being processed */
  processing: number;
  /** Average wait time for dequeued items in milliseconds */
  avgWaitTime: number;
}

// ============================================================================
// QUEUE INTERFACE
// ============================================================================

/**
 * Interface for a priority-based queue implementation
 *
 * Features:
 * - Generic type support for any item type
 * - Priority-based ordering (higher priority = processed first)
 * - Async operations for thread safety
 * - Statistics tracking (size, wait time, processing state)
 * - Clear queue with optional cancellation of running tasks
 *
 * @template T - Type of items stored in the queue (default: unknown)
 */
export interface IQueue {
  /**
   * Adds an item to the queue with optional priority
   *
   * @template T - Type of the item to enqueue
   * @param item - Item to enqueue
   * @param priority - Priority level (optional, default implementation: 1)
   *                   Higher values indicate higher priority
   * @returns Promise that resolves when item is successfully enqueued
   */
  enqueue<T>(item: T, priority?: number): Promise<void>;

  /**
   * Removes and returns the highest priority item from the queue
   *
   * @template T - Expected type of the dequeued item
   * @returns Promise resolving to dequeued item, or null if queue is empty
   */
  dequeue<T>(): Promise<T | null>;

  /**
   * Returns the highest priority item without removing it from the queue
   *
   * @template T - Expected type of the peeked item
   * @returns Promise resolving to peeked item, or null if queue is empty
   */
  peek<T>(): Promise<T | null>;

  /**
   * Returns the total number of items in the queue (waiting + processing)
   *
   * @returns Promise resolving to total queue size
   */
  size(): Promise<number>;

  /**
   * Checks if the queue has no items (waiting or processing)
   *
   * @returns Promise resolving to true if queue is completely empty
   */
  isEmpty(): Promise<boolean>;

  /**
   * Clears the queue and optionally cancels running tasks
   *
   * @param cancelRunning - If true, also clears currently processing items
   *                        (default: false)
   * @returns Promise resolving to the number of items cleared
   */
  clear(cancelRunning?: boolean): Promise<number>;

  /**
   * Returns current statistics about the queue state
   *
   * @returns Promise resolving to queue statistics including size, wait time,
   *          and processing state
   */
  getStats(): Promise<IQueueStats>;
}
