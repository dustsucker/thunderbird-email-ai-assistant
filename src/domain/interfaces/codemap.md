# src/domain/interfaces/

## Responsibility
Ports of the hexagon (Dependency Inversion): contracts the domain needs from the outside world. `ILogger` (severity levels + `maskApiKey` for secret-safe logging), `ITagManager` (tag CRUD + message-tagging against Thunderbird, plus `TagUpdateOptions`), `IClock` (injectable time: `now`, `currentDate`), `IRandom` (injectable randomness: `uuid`, `randomInt`). Barrel `index.ts` is the canonical import point.

## Design
- Port/Adapter pattern: interfaces here, implementations in infrastructure (`ConsoleLogger`, `ThunderbirdTagManager`, `SystemClock`, `CryptoRandom`) — domain never imports them.
- Constructor injection by string token with TSyringe: `@inject('ILogger')`, `@inject('ITagManager')` (as done in `TagService`).
- Optional capability: `ITagManager.getCustomTags?` is optional — callers feature-detect (`this.tagManager.getCustomTags ? ... : fallback`), enabling storage-less adapters.
- Mock-first design: `IClock`/`IRandom` exist so time and randomness are deterministic in tests (`mockClock = { now: () => 1000000 }`).
- Type re-exports: `ThunderbirdTag`, `StorageCustomTags`, `CustomTags` flow through `ITagManager` from `@/shared/types/TagTypes` for backward compatibility.

## Flow
1. `src/background/DIContainer.ts` registers concrete adapters against these tokens.
2. Domain services resolve them via `@inject` in their constructors.
3. `ITagManager` call sequences: `getAllTags()` → `createTag(name, color?, sortKey?)` → `setTagsOnMessage`/`addTagToMessage`/`removeTagFromMessage`; `ensureTagExists` implements create-or-return.
4. `ILogger.maskApiKey(key)` returns `sk-proj-...456`-style masked output for every log path.

## Integration
- Consumed by: domain services (`TagService`, `EmailContentExtractor`), infrastructure implementations, and interface-layer adapters (`ThunderbirdMailReader`, `MessageHandler`, `EmailEventListener`, `DebugTab`, `ProviderSettingsService`).
- Depends on: `@/shared/types/TagTypes` only. No code, no external dependencies — types only.
