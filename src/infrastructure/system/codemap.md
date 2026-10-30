# src/infrastructure/system/

## Responsibility
Production implementations of platform-primitive ports: `SystemClock` (`IClock`) for time and `CryptoRandom` (`IRandom`) for secure randomness/UUIDs.

## Design
- Adapter pattern over native platform APIs, kept behind domain interfaces so tests inject fakes.
- `SystemClock` (`@injectable`): `now()` → `Date.now()`, `currentDate()` → `new Date()`.
- `CryptoRandom` (`@injectable`): `uuid()` prefers `crypto.randomUUID()` with a `getRandomValues`-based UUIDv4 fallback (version/variant bits set manually); `randomInt(min, max)` uses rejection sampling over `crypto.getRandomValues` for uniform, unbiased integers; throws on non-integer or inverted ranges.
- Barrel `index.ts` exports both classes.

## Flow
1. Bootstrap registers `container.registerSingleton('IClock', SystemClock)` / `('IRandom', CryptoRandom)`.
2. Repositories (`MetricsRepository`, `TagHistoryRepository`) and retry logic inject them: `clock.now()` for timestamps/TTL math, `random.uuid()` for record IDs, `randomInt()` for retry jitter.

## Integration
- Consumed by: `storage/` repositories, retry/backoff paths, any code needing deterministic-time-testable timestamps.
- Depends on: `@/domain/interfaces/IClock`, `@/domain/interfaces/IRandom`, Web Crypto API (`globalThis.crypto`), TSyringe.
