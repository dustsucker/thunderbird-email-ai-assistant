# src/interfaces/shared/

## Responsibility
Cross-cutting helpers shared by background services and options-page UI: provider-settings resolution, folder message listing, and the reusable component/style library under `components/` and `styles/`.

## Design
- **Helper/service extraction**: `ProviderSettingsService` is a deliberately plain (non-`@injectable`) class composed by callers that already receive `AppConfigService` + `ILogger` from DI; it replaced duplicated `getProviderSettings()` / `getMessagesToAnalyze()` copies in `EmailEventListener`, `MessageHandler`, and the context-menu handler.
- `getMessagesToAnalyze()` paginates `messenger.messages.list(folderId)` / `messenger.messages.continueList(page.id)` and never calls `list(undefined)`.
- `getProviderSettings()` resolves `appConfig.defaultProvider` through `AppConfigService`, degrading to `{ provider: '' }` on failure so callers can skip analysis.

## Flow
1. Background service (e.g. `MessageHandler.handleStartBatchAnalysis`) composes the service in its constructor.
2. `getProviderSettings()` → settings for the configured default provider (or empty provider to signal "not configured").
3. `getMessagesToAnalyze(folderId)` → all message IDs of a folder as strings, iterating every pagination page.

## Integration
- Consumed by: `background/EmailEventListener`, `background/MessageHandler`, context-menu handler.
- Depends on: `@/infrastructure/config/AppConfig`, `@/infrastructure/interfaces/IProvider`, `@/domain/interfaces` (ILogger), global `messenger.messages`.
- Contains: `ProviderSettingsService.ts`, `components/` (ConfidenceBadge, LowConfidenceIndicator), `styles/` (confidence.css, indicators.css).
