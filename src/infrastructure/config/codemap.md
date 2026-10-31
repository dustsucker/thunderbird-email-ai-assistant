# src/infrastructure/config/

## Responsibility
Application configuration service.

## Files
- `AppConfig.ts` - `AppConfigService` (`@singleton()`): loads and caches the active
  configuration (`AppConfig` type from `src/shared/types/ProviderTypes.ts`) via
  `IConfigRepository`; raises `ConfigNotSetError` (from
  `../repositories/StorageLocalConfigRepository.ts`) when no configuration exists,
  instead of silently substituting defaults.

## Integration
- Self-registers via `@singleton()`; consumed by use cases, adapters, and options UI.
- Tested in `test/config.test.ts` and `test/config-repository.test.ts`.
