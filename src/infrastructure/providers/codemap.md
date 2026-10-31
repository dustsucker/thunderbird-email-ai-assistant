# src/infrastructure/providers/

## Responsibility
AI provider abstraction: prompt building, provider implementations behind a common
base class, response validation, and a static registry + factory with DI.

## Files
- `BaseProvider.ts` - Abstract base with retry/timeout; template methods
  `getApiUrl()`, `buildRequestBody()`, `parseResponse()`, `validateSettings()`,
  plus `getAuthHeaderKey()`/`formatAuthHeader()`.
- `BaseProviderAdapter.ts` - Adapter bridging `BaseProvider` to the `IProvider`
  interface for DI compatibility.
- `ProviderFactory.ts` - Static `PROVIDER_REGISTRY` (ReadonlyMap literal, 10 entries:
  openai, claude, gemini, mistral, ollama, deepseek, openrouter, openrouter-decisions,
  zai-paas, zai-coding), `getProvider()`, custom provider support, `ProviderTokens`.
- `PromptBuilder.ts` - `buildPrompt()` renders the analysis prompt;
  `truncateText()` caps body length.
- `ProviderUtils.ts` - Shared provider helpers; `LLMResponseParseError` (raised when a
  provider response cannot be parsed - parse failures are never treated as success).
- `Validator.ts` - Response validation: per-provider response interfaces, `Validator`
  class, type guards (`isOpenAIResponse`, `isGeminiResponse`, ...).
- `index.ts` - Barrel export.

## Adding a Provider
1. Create `impl/NewProvider.ts` extending `BaseProvider` (see
   [impl/codemap.md](impl/codemap.md)).
2. Add an entry to the `PROVIDER_REGISTRY` Map literal in `ProviderFactory.ts`
   (registration happens at module load; the map is a ReadonlyMap, so `.set()` does not compile).

## Integration
- Registered under `provider:<id>` tokens in `src/background/DIContainer.ts`.
- Tested in `test/infrastructure/providers/` (one suite per provider plus base/adapter/factory).
