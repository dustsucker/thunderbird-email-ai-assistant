# Infrastructure Layer - External Services Implementation

## Purpose

Implements interfaces from domain/application layers, handling external service integrations: AI providers, storage, logging, and Thunderbird APIs.

## Directory Structure

```
src/infrastructure/
├── interfaces/              # Interface contracts
│   ├── IProvider.ts         # AI provider for email analysis
│   ├── ICache.ts            # Generic cache with TTL
│   ├── IConfigRepository.ts # Configuration persistence
│   ├── IMailReader.ts       # Email reading/parsing
│   └── IQueue.ts            # Priority queue
├── providers/               # AI provider implementations (10)
│   ├── BaseProvider.ts      # Abstract base with retry/timeout
│   ├── BaseProviderAdapter.ts # Adapter: BaseProvider → IProvider
│   ├── ProviderFactory.ts   # Factory with static PROVIDER_REGISTRY & DI
│   ├── PromptBuilder.ts     # Prompt rendering (buildPrompt, truncateText)
│   ├── ProviderUtils.ts     # Shared helpers, LLMResponseParseError
│   ├── Validator.ts         # Provider response validation + type guards
│   └── impl/                # OpenAI, Claude, Gemini, Mistral, Ollama, Deepseek,
│                            # OpenRouter, OpenRouterDecisions, ZaiPaaS, ZaiCoding
├── cache/                   # AnalysisCache.ts (persistent IndexedDB),
│                            # MemoryCache.ts (in-memory, SHA-256 keys)
├── config/AppConfig.ts      # AppConfigService - configuration service with caching
├── logger/                  # ConsoleLogger.ts, DebugLogBuffer.ts, LegacyLogger.ts
├── repositories/            # StorageLocalConfigRepository.ts (+ ConfigNotSetError)
├── storage/                 # MetricsRepository.ts, TagHistoryRepository.ts,
│                            # TagApplyHistoryRepository.ts (undo history)
└── system/                  # SystemClock.ts, CryptoRandom.ts
```

> **Note**: `ILogger` and `ITagManager` are defined in `@/domain/interfaces/`.
> Import them from there; `src/infrastructure/interfaces/` holds only
> infrastructure-level contracts (IProvider, ICache, IConfigRepository, IMailReader, IQueue).

## Architecture Rules

1. **Dependency Inversion**: Implement interfaces from `@/domain/interfaces/`, never depend on concrete implementations
2. **Dependency Injection**: Use `@injectable()` decorator, inject via constructor
3. **Error Handling**: Wrap external API errors, log via ILogger
4. **API Key Safety**: Always mask API keys in logs using `maskApiKey()`
5. **Async Operations**: All external calls must be async with proper error handling
6. **Interface Imports**: Import `ILogger` and `ITagManager` from `@/domain/interfaces`, not from infrastructure

## Key Patterns

### Provider Pattern (BaseProvider)

```typescript
export abstract class BaseProvider {
  protected abstract getApiUrl(): string;
  protected abstract buildRequestBody(...): RequestBody;
  protected abstract parseResponse(response: unknown): TagResponse;
  public abstract validateSettings(settings: BaseProviderSettings): boolean;
  // Template methods: getAuthHeaderKey(), formatAuthHeader()
}
```

### Adapter Pattern (BaseProviderAdapter)

Bridges legacy `BaseProvider` to new `IProvider` interface for DI compatibility.

### Repository Pattern (IConfigRepository)

Abstracts configuration persistence via `StorageLocalConfigRepository` using browser.storage.local.

### Factory Pattern (ProviderFactory)

Manages provider lifecycle. All providers are statically imported and bundled — **no dynamic import() / code-splitting** (the packaged extension ships only the main bundles; async chunks would 404 at runtime).

## Adding a New Provider

```typescript
// 1. Create in providers/impl/NewProvider.ts
export class NewProvider extends BaseProvider {
  protected getApiUrl(): string {
    return 'https://api.example.com/v1/chat';
  }
  protected buildRequestBody(settings, prompt, data, tags) {
    return { model: settings.model, messages: [{ role: 'user', content: prompt }] };
  }
  protected parseResponse(response: unknown): TagResponse {
    /* parse */
  }
  public validateSettings(settings): boolean {
    return !!(settings.apiKey && settings.model);
  }
}

// 2. Add an entry to the PROVIDER_REGISTRY Map literal in ProviderFactory.ts
//    (a ReadonlyMap - registration happens at module load, .set() does not compile)
['newprovider', NewProvider as ProviderConstructor],
```

## Interface Implementation Checklist

- [ ] Add `@injectable()` decorator from `tsyringe`
- [ ] Inject dependencies via constructor with `@inject('Token')`
- [ ] Implement all interface methods with JSDoc `@throws`
- [ ] Use `logger.error/info/debug` for logging
- [ ] Mask sensitive data (API keys) in logs
- [ ] Handle external API errors gracefully

## DI Tokens

Registrations live in `src/background/DIContainer.ts` (single wiring point):

```typescript
'ILogger'           → ConsoleLogger
'ICache'            → MemoryCache
'IConfigRepository' → StorageLocalConfigRepository
'IClock'            → SystemClock
'IRandom'           → CryptoRandom
'provider:openai'   → BaseProviderAdapter<OpenAIProvider>  // ProviderTokens
```

## Dual Cache Architecture

| Cache              | Location      | Purpose                                             |
| ------------------ | ------------- | --------------------------------------------------- |
| ICache/MemoryCache | This layer    | Transient caching via DI (rate limiting, temp data) |
| AnalysisCache      | src/infrastructure/cache/AnalysisCache.ts | Persistent LLM analysis in IndexedDB |
