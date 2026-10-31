# src/infrastructure/repositories/

## Responsibility
Configuration persistence.

## Files
- `StorageLocalConfigRepository.ts` - Implements `IConfigRepository` on top of
  `browser.storage.local`; defines `ConfigNotSetError`, raised when configuration
  is missing so callers never silently fall back to wrong defaults.
- `index.ts` - Barrel export.

## Integration
- Registered as `'IConfigRepository'` in `src/background/DIContainer.ts`.
- Tested in `test/config-repository.test.ts`, `test/storage-read-errors.test.ts`.
