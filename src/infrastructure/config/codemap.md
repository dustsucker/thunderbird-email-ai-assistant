# src/infrastructure/config/

## Responsibility
Configuration service layer: `AppConfigService` provides cached read/write access to app config, per-provider settings, and tag definitions, with defaults, fallbacks, and validation helpers.

## Design
- `@singleton()` `AppConfigService` wraps `IConfigRepository` (Decorator/Caching Proxy over the repository) with a private `Map<string, CacheEntry>` TTL cache (5 min default) — separate from `ICache`/`MemoryCache`.
- Owns static defaults: `HardcodedTags` (`is_scam`, `spf_fail`, `dkim_fail`, `tagged`), `defaultCustomTags` (8 classification tags with prompts), `DefaultConfig` (default provider `ollama`, API keys, per-provider default models).
- Type-guard style helpers: `isValidProvider`, `isHardcodedTag`, `isValidColor`, `validateConcurrencyConfig`; concurrency policy in `getConcurrencyLimit` with per-provider default table (e.g. openai/mistral/deepseek/openrouter: 10, ollama/gemini/claude/zai: 5).
- `getPromptTemplate()` returns the `{headers}/{body}/{attachments}` analysis prompt skeleton consumed by prompt building.

## Flow
1. Constructor injects `'ILogger'` + `'IConfigRepository'` and registers a `browser.storage.onChanged` listener.
2. Reads (`getAppConfig`, `getProviderSettings(providerId)`, `getCustomTags`) check cache → repository → fallback defaults on error.
3. Writes (`setAppConfig`, `setProviderSettings`, `setCustomTags`) persist then `invalidateCache(key)`; direct storage writes from `options.ts` also trigger invalidation via the storage listener.

## Integration
- Consumed by: background orchestration and options UI (via DI).
- Depends on: `../interfaces/IConfigRepository`, `../interfaces/ILogger`, `@/shared/types/ProviderTypes` (`Provider`, `AppConfig`, `ModelConcurrencyConfig`), TSyringe.
