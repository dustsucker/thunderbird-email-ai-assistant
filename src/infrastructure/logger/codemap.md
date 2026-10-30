# src/infrastructure/logger/

## Responsibility
Logging subsystem: `ConsoleLogger` (DI logger implementing domain `ILogger`) with a shared output gate, `DebugLogBuffer` (ring buffer mirrored to `storage.session`), and `LegacyLogger` (provider-prefixed legacy `Logger` with per-provider singleton registry).

## Design
- `ConsoleLogger` (`@injectable`): `[LOG]`-prefixed console output; every context object passes through `sanitizeForLogging()` before stringifying — API-key masking is enforced centrally so keys never reach console or buffer. `maskApiKey()` returns `first7...last3` (or `'***'` for keys ≤ 10 chars, `'not set'` when falsy). Module-level `sharedLogger` singleton shares gate + buffer with DI instances (issue #11).
- Shared output gate (`LoggerGateConfig`): `configure({enabled, level})` mutates a module-level `gate` read on every log call; `shouldLog()` ranks levels via `LEVEL_RANK` (debug < info < warn < error).
- `DebugLogBuffer` (`@injectable`, singleton `debugLogBuffer`): 2000-entry FIFO ring (`DEBUG_LOG_BUFFER_CAP`), `droppedCount` bookkeeping, 1000 ms trailing-throttle writes to `storage.session` key `'debugLogs'` (feature-detected via `detectSessionStorage`, TB115+; merge-on-restore in constructor).
- `LegacyLogger.ts`: `LogLevel` enum, `Logger.getInstance(provider)` multiton, own `maskApiKey`.

## Flow
1. Bootstrap calls `ConsoleLogger.configure()` with persisted `enableLogging` config → gate state.
2. `debug/info/warn/error(msg, ctx)` → `shouldLog()` gate check → `formatMessage()` sanitizes context → console output + `emit()` pushes pre-sanitized JSON into `debugLogBuffer.add()`.
3. Buffer schedules throttled `writeToSession()`; on event-page wake, constructor restores and merges persisted entries.
4. UI/diagnostics read `debugLogBuffer.getEntries()` (newest-first) and `getDroppedCount()`; `clear()` empties buffer + session mirror.

## Integration
- Consumed by: everything via `'ILogger'` token; `ProviderUtils` and `MemoryCache` import `sharedLogger` directly; debug UI reads `debugLogBuffer`.
- Depends on: `../interfaces/ILogger` (deprecated alias → `@/domain/interfaces`), `@/shared/utils/loggingUtils` (`sanitizeForLogging`), TSyringe, `browser.storage.session`.
