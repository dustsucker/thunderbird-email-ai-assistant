/**
 * Unit tests for PriorityQueue (DW10d: honest processing tracking).
 */

import { describe, it, expect, vi } from 'vitest';
import { PriorityQueue } from '@/application/services/PriorityQueue';

describe('PriorityQueue', () => {
  it('dequeues in priority order (higher first)', async () => {
    const queue = new PriorityQueue();
    await queue.enqueue('low', 1);
    await queue.enqueue('high', 5);
    await queue.enqueue('mid', 3);

    expect(await queue.dequeue<string>()).toBe('high');
    expect(await queue.dequeue<string>()).toBe('mid');
    expect(await queue.dequeue<string>()).toBe('low');
  });

  it('isEmpty() is true only after completions are reported', async () => {
    const queue = new PriorityQueue();
    await queue.enqueue('a', 1);

    expect(await queue.isEmpty()).toBe(false);

    const item = await queue.dequeue<string>();
    expect(item).toBe('a');

    // Still processing — not empty
    expect(await queue.isEmpty()).toBe(false);

    await queue.complete(item);
    expect(await queue.isEmpty()).toBe(true);
    expect(await queue.size()).toBe(0);
  });

  it('getStats() reflects processing and completions', async () => {
    const queue = new PriorityQueue();
    await queue.enqueue('a', 1);
    const item = await queue.dequeue<string>();

    let stats = await queue.getStats();
    expect(stats.processing).toBe(1);

    await queue.complete(item);
    stats = await queue.getStats();
    expect(stats.processing).toBe(0);
    expect(stats.waiting).toBe(0);
  });

  it('clear(cancelRunning=true) resets processing', async () => {
    const queue = new PriorityQueue();
    await queue.enqueue('a', 1);
    await queue.dequeue<string>();

    expect(await queue.isEmpty()).toBe(false);
    const cleared = await queue.clear(true);
    expect(cleared).toBe(1);
    expect(await queue.isEmpty()).toBe(true);
  });

  it('clear() resets the wait-time window (avgWaitTime back to 0)', async () => {
    vi.useFakeTimers();
    const queue = new PriorityQueue();
    await queue.enqueue('a', 1);
    vi.advanceTimersByTime(5000);
    await queue.dequeue<string>();

    expect((await queue.getStats()).avgWaitTime).toBeGreaterThan(0);

    await queue.clear();
    expect((await queue.getStats()).avgWaitTime).toBe(0);
    vi.useRealTimers();
  });
});
