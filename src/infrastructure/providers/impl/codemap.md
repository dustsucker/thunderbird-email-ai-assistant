# src/infrastructure/providers/impl/

## Responsibility
The 10 concrete provider adapters (one class per LLM backend), each extending
`BaseProvider` and registered in `ProviderFactory.PROVIDER_REGISTRY`.

## Files
- `OpenAIProvider.ts` - OpenAI chat completions.
- `ClaudeProvider.ts` - Anthropic Claude.
- `GeminiProvider.ts` - Google Gemini.
- `MistralProvider.ts` - Mistral.
- `OllamaProvider.ts` - Local Ollama (`apiUrl` instead of API key).
- `DeepseekProvider.ts` - DeepSeek.
- `OpenRouterProvider.ts` - OpenRouter gateway.
- `OpenRouterDecisionsProvider.ts` - OpenRouter decision models with optional
  `additionalConfig.tagThreshold`.
- `ZaiPaaSProvider.ts` - ZAI PaaS.
- `ZaiCodingProvider.ts` - ZAI Coding Plan.

## Pattern
Each provider implements only `getApiUrl()`, `buildRequestBody()`, `parseResponse()`,
and `validateSettings()`; retry/timeout/auth-header handling lives in `BaseProvider`.
No dynamic imports - all providers are statically bundled.

## Integration
- Referenced in the `PROVIDER_REGISTRY` Map literal (`ProviderFactory.ts`).
- Tested in `test/infrastructure/providers/<Name>Provider.test.ts` (mocked fetch),
  plus `test/e2e-real-provider.test.ts` for live smoke tests.
