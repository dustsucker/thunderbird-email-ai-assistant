# src/infrastructure/providers/

## Responsibility
LLM provider infrastructure: `ProviderFactory` (Factory managing provider resolution + DI), `BaseProvider` (abstract Template Method base with retry/timeout/abort), `BaseProviderAdapter` (Adapter bridging legacy `BaseProvider` to the `IProvider` port), shared `PromptBuilder`, `ProviderUtils`, and `Validator`.

## Design
- **Factory**: `ProviderFactory` holds `PROVIDER_REGISTRY` (static `ReadonlyMap` of 10 provider IDs → classes; no dynamic `import()` — async chunks are unshippable in an xpi). `getProvider(id)` → `adapterCache` memoized `IProvider`; `registerProvider()` accepts runtime `IProvider`s or wraps them via `BaseProviderAdapter` (type guard `isIProvider`); DI tokens `provider:<id>` derived by `providerToken()`. `reset()` clears only the local adapter cache.
- **Template Method**: `BaseProvider` fixes `analyze()` orchestration (timeout via `fetchWithTimeout` + `AbortController`, `retryWithBackoff`, response validation, `runId` log correlation); subclasses implement `getApiUrl()`, `buildRequestBody()`, `parseResponse()`, `validateSettings()`; hook points `getAuthHeaderKey()`, `formatAuthHeader()`.
- **Adapter**: `BaseProviderAdapter<T>` converts `IAnalyzeInput`/`IStructuredEmailData`/`ICustomTag` ↔ legacy `AnalyzeInput` types with type guards.
- **Validation**: `Validator` class + `isOpenAIResponse`/`isGeminiResponse`/`isClaudeResponse`/`isMistralResponse`/`isOllamaResponse`/`isDeepseekResponse`/`isZaiResponse` guards, `ApiResponse` union; `ProviderUtils`: `validateLLMResponse`, `extractJson`, `retryWithBackoff`, `maskApiKey`, `logAndDisplayError`, `debounce`, `TagResponse` type.
- `PromptBuilder.buildPrompt()` renders the structured-email prompt, `truncateText()` caps size.

## Flow
1. `ProviderFactory.getProvider(providerId)` → cache hit? return. Else registry lookup → `new ProviderClass(logger)` → wrap in `BaseProviderAdapter` → `isIProvider` check → cache → return.
2. `adapter.analyze(input)`: settings validated → `buildPrompt()` → provider-specific `buildRequestBody()` → `fetchWithTimeout()` (120 s default, external `AbortSignal` chained) under `retryWithBackoff` (3 retries, exponential + jitter) → `parseResponse()` → `validateLLMResponse()` → `TagResponse` (throws on failure instead of returning null).
3. Errors classified (`ErrorType`/`ErrorSeverity`) → `logAndDisplayError` → surfaced via `ShowErrorRuntimeMessage`.

## Integration
- Consumed by: application use cases (`AnalyzeEmail`), `ProviderFactory` registrations at bootstrap, `cache/AnalysisCache` (imports `ProviderUtils.logger`).
- Depends on: `../interfaces/IProvider`, `../interfaces/ILogger`, `@/shared/utils/loggingUtils`, `core/analysis`, `core/config` types, TSyringe; concrete strategies in `impl/`.
