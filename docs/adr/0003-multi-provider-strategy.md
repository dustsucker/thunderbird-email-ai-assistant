# ADR-0003: Multi-Provider LLM Strategy

## Status

Accepted

## Context

The Thunderbird Email AI Assistant needs to analyze emails and suggest tags using Large Language Models (LLMs). Users have different preferences and constraints:

1. **Cost sensitivity**: Some users prefer free local models (Ollama)
2. **Privacy concerns**: Some users want to keep emails local
3. **Quality requirements**: Some users want the best available models (GPT-4, Claude)
4. **API access**: Users have different API keys and subscriptions
5. **Network constraints**: Some environments have limited internet access

Supporting only one provider would limit our user base significantly.

## Decision

We implement a **multi-provider strategy** with **8 LLM providers**, using a **Factory Pattern** with **lazy loading** for optimal bundle size.

### Supported Providers

| Provider | Provider ID | Requires | Use Case |
|----------|-------------|----------|----------|
| **Ollama** | `ollama` | `apiUrl`, `model` | Local, free, private |
| **OpenAI** | `openai` | `apiKey`, `model` | High quality, widely used |
| **Google Gemini** | `gemini` | `apiKey`, `model` | Google ecosystem |
| **Anthropic Claude** | `claude` | `apiKey`, `model` | High quality, safety-focused |
| **Mistral** | `mistral` | `apiKey`, `model` | European, open weights |
| **DeepSeek** | `deepseek` | `apiKey`, `model` | Cost-effective |
| **ZAI PaaS** | `zai-paas` | `apiKey`, `model` | Enterprise |
| **ZAI Coding** | `zai-coding` | `apiKey`, `model` | Development |

### Architecture

```
┌─────────────────────────────────────────────┐
│              ProviderFactory                │
│  (Lazy loading with code-splitting)         │
└─────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────┐ ┌───────────┐ ┌───────────┐
│ IProvider │ │ IProvider │ │ IProvider │
│  Adapter  │ │  Adapter  │ │  Adapter  │
└─────┬─────┘ └─────┬─────┘ └─────┬─────┘
      │             │             │
      ▼             ▼             ▼
┌───────────┐ ┌───────────┐ ┌───────────┐
│BaseProvider│ │BaseProvider│ │BaseProvider│
│  (OpenAI) │ │ (Claude)  │ │ (Ollama)  │
└───────────┘ └───────────┘ └───────────┘
```

### Key Implementation Details

1. **BaseProvider Abstract Class**: Common retry logic, timeout handling, error formatting
   - Location: `src/infrastructure/providers/BaseProvider.ts`

2. **BaseProviderAdapter**: Bridges legacy BaseProvider to IProvider interface
   - Location: `src/infrastructure/providers/BaseProviderAdapter.ts`

3. **ProviderFactory**: Lazy loading with webpack code-splitting
   - Location: `src/infrastructure/providers/ProviderFactory.ts`

4. **Dynamic Imports**: Each provider is a separate chunk loaded on-demand
   ```typescript
   const PROVIDER_LOADERS = new Map([
     ['openai', () => import(/* webpackChunkName: "provider-openai" */ './impl/OpenAIProvider')],
     // ... other providers
   ]);
   ```

### Alternatives Considered

| Alternative | Pros | Cons | Decision |
|------------|------|------|----------|
| **Single Provider (OpenAI)** | Simple implementation | Limits user choice, single point of failure | Rejected |
| **Plugin System** | Maximum flexibility | Too complex, security concerns | Rejected |
| **Provider Proxy Service** | Hide complexity | Adds latency, single point of failure | Rejected |
| **Hardcoded Multi-Provider** | Straightforward | Large bundle size without lazy loading | Rejected |
| **Factory + Lazy Loading** | Small bundle, flexible | Slightly more complex | **Accepted** |

## Consequences

### Positive

- **User choice**: Users can select the provider that fits their needs
- **Resilience**: If one provider has issues, users can switch
- **Cost flexibility**: Free local option (Ollama) available
- **Privacy option**: Local processing without external API calls
- **Small bundle**: Lazy loading keeps initial bundle small
- **Extensibility**: Easy to add new providers by extending BaseProvider

### Negative

- **Maintenance burden**: 8 providers to maintain and test
- **API changes**: Each provider may change their API independently
- **Testing complexity**: Need to test against multiple providers
- **Feature parity**: Some providers may not support all features

### Mitigations

- **Common BaseProvider**: Shared logic reduces duplication
- **Comprehensive tests**: Each provider has dedicated tests
- **Clear interface**: IProvider ensures consistent behavior
- **Documentation**: Clear setup instructions for each provider

## References

### Key Files

- `src/infrastructure/providers/ProviderFactory.ts` - Factory with lazy loading
- `src/infrastructure/providers/BaseProvider.ts` - Abstract base class
- `src/infrastructure/providers/BaseProviderAdapter.ts` - DI adapter
- `src/infrastructure/providers/impl/` - Provider implementations
  - `OpenAIProvider.ts`
  - `ClaudeProvider.ts`
  - `GeminiProvider.ts`
  - `MistralProvider.ts`
  - `OllamaProvider.ts`
  - `DeepseekProvider.ts`
  - `ZaiPaaSProvider.ts`
  - `ZaiCodingProvider.ts`
- `src/infrastructure/interfaces/IProvider.ts` - Provider interface

### Related ADRs

- [ADR-0002: Hexagonal Architecture](0002-hexagonal-architecture-with-di.md)
- [ADR-0005: Value Objects](0005-value-objects-validation.md)

### External References

- [Factory Pattern](https://refactoring.guru/design-patterns/factory-method)
- [Lazy Loading in Webpack](https://webpack.js.org/guides/lazy-loading/)
