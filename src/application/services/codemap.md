# src/application/services/codemap.md

## Responsibility
Reusable, stateful cross-cutting services shared by use cases: analysis deduplication (`EmailAnalysisTracker`), API request throttling and concurrency limiting (`RateLimiterService`), and priority-ordered work queuing (`PriorityQueue`). No workflow logic of their own — they provide the mechanisms the use cases orchestrate.

## Design
- `EmailAnalysisTracker` — memoized repository pattern: lazily hydrates an in-memory `Set<number>` (LRU-bounded to `MAX_TRACKED_IDS = 5000`) from the single `storage.local` key `processedIds`, with one-time migration of legacy `processed_<id>` keys; API probed via `getMessengerApi()` (`messenger` → `browser` → `chrome`).
- `RateLimiterService` — token bucket per provider (`refillTokens`/`consumeToken`) combined with a counting semaphore per `provider:model` key (`ModelSemaphore` with `waiting` promise queue); priority-sorted task queues drained by `processQueue` worker loops.
- `PriorityQueue` — Strategy-free adapter implementing the `IQueue` port; binary-search `insertSorted` keeps descending priority with FIFO ties, plus `processing` set, `processingByItem` map and rolling wait-time stats (`getStats()` → `IQueueStats`).
- All are `@injectable()`; `EmailAnalysisTracker` and `RateLimiterService` inject the `'ILogger'` token.

## Flow
1. `EmailAnalysisTracker.wasAnalyzed(id)` → hydrate set on first call → membership check; `markAnalyzed(id)` → add + evict oldest over cap → `persist()` as JSON array to `storage.local`.
2. `RateLimiterService.configure()` creates buckets/queues; `acquire(provider, fn, priority, model?)` enqueues a wrapped task (semaphore around `requestFn`), worker loop waits for refill then resolves/rejects the caller promise.
3. `PriorityQueue.enqueue(item, priority)` sorts in; `dequeue()` moves the head into `processing`; the consumer must call `complete(item)` or `isEmpty()` stays false.

## Integration
- Consumed by: `AnalyzeEmail` and `AnalyzeBatchEmails` (tracker), `AnalyzeBatchEmails` (via `'IQueue'` token resolving `PriorityQueue`, registered in `src/background/DIContainer.ts`).
- Depends on: `ILogger` (domain), `storage.local` messenger API (implicit adapter), `IQueue`/`IQueueStats` from `infrastructure/interfaces/IQueue`. Exported via `index.ts`.
