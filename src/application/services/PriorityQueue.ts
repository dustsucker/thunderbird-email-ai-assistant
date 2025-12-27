import { injectable } from 'tsyringe';
import type { IQueue, IQueueStats } from '../../infrastructure/interfaces/IQueue';

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

/**
 * Default priority for items without explicit priority
 */
const DEFAULT_PRIORITY = 1;

// ============================================================================
// QUEUE ITEM WRAPPER
// ============================================================================

/**
 * Internal wrapper for queue items with metadata
 */
interface QueueItem<T> {
  /** Unique identifier for this item */
  id: string;
  /** The queued item data */
  item: T;
  /** Priority level (higher = more important) */
  priority: number;
  /** Timestamp when item was enqueued */
  enqueuedAt: number;
}

// ============================================================================
// PRIORITY QUEUE IMPLEMENTATION
// ============================================================================

/**
 * Priority Queue implementation based on priority values
 *
 * Features:
 * - Priority-based ordering (higher priority = processed first)
 * - Tracks items currently being processed
 * - Calculates average wait time for dequeued items
 * - Thread-safe operations (async methods)
 * - Uses @injectable() decorator for TSyringe DI
 *
 * @template T - Type of items stored in the queue
 */
@injectable()
export class PriorityQueue implements IQueue {
  private readonly queue: QueueItem<unknown>[];
  private readonly processing: Set<string>;
  private waitTimes: number[];

  constructor() {
    this.queue = [];
    this.processing = new Set();
    this.waitTimes = [];
  }

  // ========================================================================
  // PUBLIC METHODS
  // ========================================================================

  /**
   * Adds an item to the queue with optional priority
   *
   * @param item - Item to enqueue
   * @param priority - Priority level (default: 1, higher = more important)
   * @returns Promise that resolves when item is enqueued
   */
  async enqueue<T>(item: T, priority: number = DEFAULT_PRIORITY): Promise<void> {
    const queueItem: QueueItem<T> = {
      id: this.generateId(),
      item,
      priority: Math.max(0, priority), // Ensure non-negative
      enqueuedAt: Date.now(),
    };

    this.queue.push(queueItem);
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Removes and returns the highest priority item from the queue
   *
   * Item is added to the processing set and should be marked as completed
   * when done using the dequeue mechanism.
   *
   * @returns Promise resolving to dequeued item or null if queue is empty
   */
  async dequeue<T>(): Promise<T | null> {
    if (this.queue.length === 0) {
      return null;
    }

    const queueItem = this.queue.shift()!;

    // Track processing and calculate wait time
    this.processing.add(queueItem.id);
    const waitTime = Date.now() - queueItem.enqueuedAt;
    this.waitTimes.push(waitTime);

    return queueItem.item as T;
  }

  /**
   * Returns the highest priority item without removing it
   *
   * @returns Promise resolving to peeked item or null if queue is empty
   */
  async peek<T>(): Promise<T | null> {
    if (this.queue.length === 0) {
      return null;
    }

    const queueItem = this.queue[0];
    return queueItem.item as T;
  }

  /**
   * Returns the total number of items (waiting + processing)
   *
   * @returns Promise resolving to total queue size
   */
  async size(): Promise<number> {
    return this.queue.length + this.processing.size;
  }

  /**
   * Checks if the queue has no items (waiting or processing)
   *
   * @returns Promise resolving to true if queue is empty
   */
  async isEmpty(): Promise<boolean> {
    return this.queue.length === 0 && this.processing.size === 0;
  }

  /**
   * Clears the queue and optionally cancels processing items
   *
   * @param cancelRunning - If true, clears processing set as well
   * @returns Promise resolving to number of items cleared
   */
  async clear(cancelRunning: boolean = false): Promise<number> {
    const clearedWaiting = this.queue.length;
    const clearedProcessing = cancelRunning ? this.processing.size : 0;

    this.queue.length = 0;

    if (cancelRunning) {
      this.processing.clear();
    }

    return clearedWaiting + clearedProcessing;
  }

  /**
   * Returns statistics about the queue state
   *
   * @returns Promise resolving to queue statistics
   */
  async getStats(): Promise<IQueueStats> {
    const waiting = this.queue.length;
    const processing = this.processing.size;

    // Calculate average wait time (in milliseconds)
    let avgWaitTime = 0;
    if (this.waitTimes.length > 0) {
      const totalWaitTime = this.waitTimes.reduce((sum, time) => sum + time, 0);
      avgWaitTime = totalWaitTime / this.waitTimes.length;
    }

    return {
      size: waiting + processing,
      waiting,
      processing,
      avgWaitTime,
    };
  }

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  /**
   * Generates a unique identifier for queue items
   *
   * @returns Unique string identifier
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
