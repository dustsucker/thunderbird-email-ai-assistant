# src/interfaces/background/

## Responsibility
Background (service-worker side) services: react to Thunderbird mail events and expose the extension's runtime message API that options page and UI components call.

## Design
- **Observer pattern**: `EmailEventListener.registerListeners()` adds a bound handler to `messenger.messages.onNewMailReceived`; `MessageHandler.registerMessageHandlers()` adds to `browser.runtime.onMessage` (resolved from `browser` or `messenger` global by `getRuntimeOnMessage()`), with cached references for clean `removeListener`.
- **Dispatcher / command pattern**: `MessageHandler` holds a `messageHandlers` record mapping `action` strings (`startBatchAnalysis`, `analyzeSingleMessage`, `clearQueue`, `getDebugLogs`, `applyTagManually`, `dismissTag`, …) to private handlers; messages are a discriminated union on `action` via `getMessageAction()`.
- State objects `ListenerState` / `HandlerState` track registration and counters; `batchProgress: BatchProgress` mirrors batch lifecycle (`idle|running|completed|cancelled|error`).

## Flow
1. New mail: `onNewMailReceived(folder, messages)` → `ProviderSettingsService.getProviderSettings()` → `AnalyzeBatchEmails.execute(ids, {priority: 2, concurrency: 3})`.
2. Runtime message: `handleMessage()` returns `true` for known actions (async `sendResponse`), synchronously answers unknown actions.
3. `handleGetBatchProgress()` merges live `analyzeBatch.getProgress()` with locally known start/end times; `handleApplyTagManually()` tags via `ITagManager` then removes the low-confidence flag from `messenger.storage.local` (indexed by `LOW_CONFIDENCE_INDEX_KEY`).

## Integration
- Consumed by: `background.ts` (registration at startup), options-page UI via `runtime.sendMessage`.
- Depends on: `@/application` (`AnalyzeEmail`, `AnalyzeBatchEmails`), `@/infrastructure` (`AppConfigService`, `MemoryCache`, `DebugLogBuffer`, `IQueue`, `ICache`), `@/interfaces/shared/ProviderSettingsService`, `@/domain/interfaces` (ILogger, ITagManager).
