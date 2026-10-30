# src/infrastructure/repositories/

## Responsibility
Configuration persistence adapter: `StorageLocalConfigRepository` implements `IConfigRepository` on top of `browser.storage.local` for the three config namespaces (`providerSettings`, `customTags`, `appConfig`).

## Design
- Repository pattern: `@injectable` class with `@inject('ILogger')`; `hasBrowserStorage()` type guard picks `browser` then falls back to `chrome` global.
- Write serialization: a promise-chained `writeQueue` orders read-modify-write sequences (`get` → mutate → `set`) to avoid lost-update races.
- `STORAGE_KEYS` constants pin the three top-level storage keys; barrel `index.ts` exports the class plus `IConfigRepository`-related types.

## Flow
1. `getAppConfig()` / `getProviderSettings(id)` / `getCustomTags()` → `storage.local.get(key)` → parse/validate into `IAppConfig`/`IProviderSettings`/`ICustomTag`.
2. `setAppConfig()` / `setProviderSettings(id, settings)` / `setCustomTags(tags)` enqueue onto `writeQueue`, then `storage.local.set()`; failures logged and rethrown.
3. Downstream `AppConfigService` caches results and listens on `browser.storage.onChanged` for external invalidation.

## Integration
- Consumed by: `AppConfigService` (via `'IConfigRepository'` DI token), `options.ts` persistence paths.
- Depends on: `../interfaces/IConfigRepository`, `../interfaces/ILogger`, WebExtension `storage.local` API, TSyringe.
