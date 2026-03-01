# Infrastructure Layer - External Services Implementation

## Purpose

Implements interfaces from domain/application layers, handling external service integrations: AI providers, storage, logging, and Thunderbird APIs.

## Directory Structure

```
src/infrastructure/
├── interfaces/              # Interface contracts
│   ├── IProvider.ts         # AI provider for email analysis
│   ├── ICache.ts            # Generic cache with TTL
│   ├── ILogger.ts           # DEPRECATED: Alias to @/domain/interfaces/ILogger
│   ├── IConfigRepository.ts # Configuration persistence
│   ├── IMailReader.ts       # Email reading/parsing
│   ├── ITagManager.ts       # DEPRECATED: Alias to @/domain/interfaces/ITagManager
│   └── IQueue.ts            # Priority queue
├── providers/               # AI provider implementations
│   ├── BaseProvider.ts      # Abstract base with retry/timeout
│   ├── BaseProviderAdapter.ts # Adapter: BaseProvider → IProvider
│   ├── ProviderFactory.ts   # Factory with lazy-loading & DI
│   └── impl/                # OpenAI, Claude, Gemini, Mistral, Ollama, Deepseek, ZaiPaaS, ZaiCoding
├── cache/MemoryCache.ts     # In-memory cache with SHA-256 hashing
├── logger/ConsoleLogger.ts  # Console-based logger (implements domain ILogger)
├── repositories/IndexedDBConfigRepository.ts
└── config/AppConfig.ts      # Configuration service with caching
```

> **Note**: `ILogger` and `ITagManager` are now defined in `@/domain/interfaces/`.
> The files in `src/infrastructure/interfaces/` are deprecated aliases kept for backward compatibility.
> Always import from `@/domain/interfaces` for new code.

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

Abstracts configuration persistence via `IndexedDBConfigRepository` using browser.storage.local.

### Factory Pattern (ProviderFactory)

Manages provider lifecycle with lazy loading and code-splitting for optimal bundle size.

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

// 2. Register in ProviderFactory PROVIDER_LOADERS Map
['newprovider', () => import('./impl/NewProvider').then((m) => ({ default: m.NewProvider }))];
```

## Interface Implementation Checklist

- [ ] Add `@injectable()` decorator from `tsyringe`
- [ ] Inject dependencies via constructor with `@inject('Token')`
- [ ] Implement all interface methods with JSDoc `@throws`
- [ ] Use `logger.error/info/debug` for logging
- [ ] Mask sensitive data (API keys) in logs
- [ ] Handle external API errors gracefully

## DI Tokens

```typescript
'ILogger'           → ConsoleLogger
'ICache'            → MemoryCache
'IConfigRepository' → IndexedDBConfigRepository
'provider:openai'   → BaseProviderAdapter<OpenAIProvider>
```

## Dual Cache Architecture

| Cache              | Location      | Purpose                                             |
| ------------------ | ------------- | --------------------------------------------------- |
| ICache/MemoryCache | This layer    | Transient caching via DI (rate limiting, temp data) |
| AnalysisCache      | core/cache.ts | Persistent LLM analysis in IndexedDB                |
