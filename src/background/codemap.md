# src/background/

## Responsibility
Extension background script area: bootstraps the TSyringe container and orchestrates the long-lived event loop of the MailExtension — Thunderbird event listeners, context-menu/toolbar/install handlers, and graceful shutdown.

## Design
- `index.ts` — module entry point, re-exports all services and handlers
- `BackgroundScript.ts` — `@injectable()` orchestrator with `initialize()`/`shutdown()` lifecycle and `isInitialized` guard; resolves `ILogger`, applies persisted logging config via `applyLoggingConfig()`, then starts `EmailEventListener` and `MessageHandler` (from `@/interfaces/background`)
- `DIContainer.ts` — `setupDIContainer()` registers all singletons (`ILogger`→`ConsoleLogger`, `IMailReader`→`ThunderbirdMailReader`, use cases, `ProviderFactory` under string token) plus `startupLogger` for pre-DI logging through the shared `DebugLogBuffer`
- `ContextMenuHandler.ts`, `ToolbarHandler.ts`, `InstallHandler.ts` — `@injectable()` handlers with `register()`/`unregister()` pairs; handlers call use cases (`AnalyzeEmail`, `AnalyzeBatchEmails`, `UndoTagChanges`) and format user messages via `@/shared/utils/errorMessages`

## Flow
1. `background.ts` calls `setupDIContainer()`, then `BackgroundScript.initialize()`.
2. Logger config applied → `TagService.ensureTagsExist()` → services started → menus, toolbar badge and install handlers registered.
3. Events (new mail, message action, toolbar click, `messenger.runtime.onInstalled`) trigger use cases; `AnalyzeBatchEmails` reports batch progress to `ToolbarHandler` via the `BatchProgressListener` token.
4. `messenger.runtime.onSuspend` → `shutdown()` stops services and unregisters handlers.

## Integration
- Consumed by: `background.ts` (webpack entry)
- Depends on: `application/use-cases`, `domain/services/TagService`, `infrastructure/*` (logger, config, cache, providers, storage), `interfaces/adapters`, `interfaces/background` listeners, `messenger` API (`types/thunderbird.d.ts`)
