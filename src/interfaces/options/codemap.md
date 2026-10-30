# src/interfaces/options/

## Responsibility
UI components mounted by the extension's options page (root `options.html` / `options.ts`). Currently ships only the `DebugTab`: live processing-queue panel and debug log viewer.

## Design
- **Passive View / polling controller**: `DebugTab` is a TSyringe `@injectable()` class with an optional `ILogger` (falls back to `noopLogger` so it works without a container). It binds DOM elements by fixed IDs (`debug-log-filter`, `debug-cancel-batch-btn`, `debug-stat-*`, …) and renders by direct DOM mutation.
- **Polling Observer**: `onTabVisibilityChanged(true|false)` starts/stops a 1 s `setInterval` (`POLL_INTERVAL_MS`); `beforeunload` stops it.
- Message contract types mirror the backend: `QueueStatsResponse` (with optional `cacheErrors`), `DebugLogsResponse`, `DebugLogEntry`, `CancelBatchResponse`; `LEVEL_ORDER` implements a minimum-level log filter.

## Flow
1. `render()` wires filter/download/clear/cancel buttons and loads logging settings from `messenger.storage.local` (`appConfig.enableLogging` / `logLevel`, persisted by `persistLoggingSettings()`).
2. Each `pollTick()` sends `{action: 'getQueueStats'}` and `{action: 'getDebugLogs'}` via `sendMessage()` (`window.browser.runtime.sendMessage` callback wrapped in a Promise); transport failure sets a "Verbindung…" state.
3. `renderQueueStats()` updates status badge, progress bar, counters, cancel-button enablement; `renderLogList()` rebuilds rows via `createLogRow()` filtered by minimum level; `downloadLog()` exports all entries as a `.txt` Blob.

## Integration
- Consumed by: root `options.ts` (DI resolution + tab-visibility notification).
- Depends on: `@/domain/interfaces` (ILogger); backend `MessageHandler` over `runtime` messaging; `messenger.storage.local` for logging settings.
