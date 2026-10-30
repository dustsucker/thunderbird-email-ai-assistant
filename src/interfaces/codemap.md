# src/interfaces/

## Responsibility
Outermost hexagonal layer: adapts the Thunderbird WebExtension host to the application core and hosts all user-facing UI. It is the only layer permitted to touch the `messenger`/`browser` globals directly.

## Design
- **Adapter pattern**: `adapters/ThunderbirdMailReader` and `adapters/ThunderbirdTagManager` implement `IMailReader` / `ITagManager` from `src/infrastructure/interfaces/`, translating Thunderbird API shapes into domain types.
- **Observer pattern**: `background/EmailEventListener` subscribes to `messenger.messages.onNewMailReceived`; `background/MessageHandler` subscribes to `browser.runtime.onMessage`.
- **Dependency Injection**: all services use TSyringe `@injectable()` / `@inject()`; UI components follow a render + polling lifecycle (`options/DebugTab`).
- Subtrees: `adapters/` (API bridges), `background/` (service-worker services), `options/` (options-page UI), `shared/` (reusable components, styles, `ProviderSettingsService`).

## Flow
1. Thunderbird fires events (`onNewMailReceived`, `runtime.onMessage`) into `background/` services.
2. `MessageHandler` dispatches by `action` discriminator to use cases (`AnalyzeEmail`, `AnalyzeBatchEmails`).
3. Use cases call adapters through `IMailReader` / `ITagManager` ports; adapters call `messenger.*`.
4. UI (`options/`, `shared/components/`) sends runtime messages to the background and renders responses.

## Integration
- Consumed by: `background.ts` and root `options.ts` entry points (DI container wiring).
- Depends on: `src/application` (use cases), `src/infrastructure` (interfaces, `AppConfigService`, `MemoryCache`, `DebugLogBuffer`), `src/domain` (ILogger), `src/shared` (constants, `confidenceUtils`).
