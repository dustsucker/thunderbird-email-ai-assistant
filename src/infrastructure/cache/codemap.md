# src/infrastructure/cache/

## Responsibility
Dual cache subsystem: `MemoryCache` for transient DI-injected caching (rate-limit/temp data) and `AnalysisCache` for persistent LLM analysis results keyed by email hash, plus hashing helpers (`hashEmail`, `simpleHash`, `createCacheKey`, `normalizeHeaders`, `isEmailFresh`).

## Design
- `MemoryCache` (`@injectable`, implements `ICache` from `../interfaces/ICache`): generic Map storage, SHA-256 key hashing via Web Crypto (`hashKey`), per-entry TTL (default 24 h), FIFO eviction at `MAX_ENTRIES` (500), hit/miss stats (`getStats` → `ICacheStats`), error counter (`getErrorCount`, issue #8 non-silent catches).
- `AnalysisCache`: IndexedDB wrapper (`openDatabase`, `executeTransaction`) over DB `EmailAnalysisCache`/store `analysisCache` (version 2 with cursor-based v1→v2 migration adding `tagConfidence`). Exported as module singleton `analysisCache` — deliberately NOT in DI (persists across restarts).
- Barrel: `index.ts` re-exports both plus `ICache` types.

## Flow
1. `MemoryCache.set(key, value, ttl?)` → SHA-256 hash key → Map insert → FIFO cap eviction. `get`/`has` check `timestamp + ttl` expiry, lazily delete expired entries; `cleanupExpired()` sweeps.
2. `AnalysisCache`: `createCacheKey(body, headers)` normalizes 7 relevant headers, SHA-256-hashes body+headers → `get/set/delete/getWithDetails/getTagConfidence` via IDB transactions; `cleanupExpired()` uses the `timestamp` index with `IDBKeyRange`.

## Integration
- Consumed by: application use cases and background orchestration (`MemoryCache` via `'ICache'` token; `analysisCache` by direct import in the analysis path).
- Depends on: `../interfaces/ICache`, `../logger/ConsoleLogger` (`sharedLogger`), `../providers/ProviderUtils` (`logger`, `TagResponse`), Web Crypto, IndexedDB.
