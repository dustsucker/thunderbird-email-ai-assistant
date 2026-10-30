import { injectable } from 'tsyringe';
import type { IQueue, IQueueStats } from '../../infrastructure/interfaces/IQueue';

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

/**
 * Default priority for items without explicit priority
 */
const DEFAULT_PRIORITY = 1;

/**
 * Number of samples kept for the rolling average wait time.
 * Caps memory and prevents stale waits from skewing the average forever.
 */
const MAX_WAIT_SAMPLES = 100;

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
  // ponytail: Map keyed by item reference — duplicate item objects collide,
  // switch to per-id handles if that ever matters.
  private readonly processingByItem: Map<unknown, string>;
  private waitTimes: number[];

  constructor() {
    this.queue = [];
    this.processing = new Set();
    this.processingByItem = new Map();
    this.waitTimes = [];
  }

  /**
   * Marks a dequeued item as fully processed.
   *
   * Call this after finishing work on an item returned by dequeue(),
   * otherwise the item stays counted as processing and isEmpty() lies.
   *
   * @param item - The previously dequeued item
   */
  async complete(item: unknown): Promise<void> {
    const id = this.processingByItem.get(item);
    if (id !== undefined) {
      this.processing.delete(id);
      this.processingByItem.delete(item);
    }
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

    this.insertSorted(queueItem);
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
    this.processingByItem.set(queueItem.item, queueItem.id);
    const waitTime = Date.now() - queueItem.enqueuedAt;
    this.waitTimes.push(waitTime);
    if (this.waitTimes.length > MAX_WAIT_SAMPLES) {
      this.waitTimes.shift();
    }

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
      this.processingByItem.clear();
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
   * Inserts an item at its sorted (descending priority) position using binary
   * search — O(log n) lookup + O(n) splice instead of an O(n log n) re-sort.
   * Equal priorities keep FIFO order (inserted after existing equals).
   *
   * @param queueItem - Wrapped item to insert
   */
  private insertSorted(queueItem: QueueItem<unknown>): void {
    let low = 0;
    let high = this.queue.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.queue[mid].priority >= queueItem.priority) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this.queue.splice(low, 0, queueItem);
  }

  /**
   * Generates a unique identifier for queue items
   *
   * @returns Unique string identifier
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
