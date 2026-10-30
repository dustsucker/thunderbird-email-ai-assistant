# src/infrastructure/providers/impl/

## Responsibility
The 10 concrete LLM provider strategies (`@injectable`, all extending `BaseProvider`), each implementing `getApiUrl()`, `buildRequestBody()`, `parseResponse()`, `validateSettings()` for its API.

## Design
All are Strategy subclasses of the `BaseProvider` Template Method; each exports `<Name>Provider` registered in `ProviderFactory.PROVIDER_REGISTRY`. Distinguishing traits:

- `OpenAIProvider` — `https://api.openai.com/v1/chat/completions`; reference chat-completions implementation (`choices[0].message.content`), `Authorization: Bearer`.
- `ClaudeProvider` — `https://api.anthropic.com/v1/messages`; Anthropic Messages API, `x-api-key` + `anthropic-version` headers.
- `GeminiProvider` — Google Generative Language `generateContent` style; parses `candidates[].content.parts[]`, handles `finishReason` enum incl. `SAFETY`, reads `usageMetadata`; model default `gemini-1.5-flash-latest`.
- `MistralProvider` — `https://api.mistral.ai/v1/chat/completions`; OpenAI-compatible body/response.
- `OllamaProvider` — local `apiUrl` (`/api/generate` style), no API key; parses `OllamaGenerateResponse` (`response`, `done`) and `OllamaErrorResponse` via guards.
- `DeepseekProvider` — `https://api.deepseek.com/chat/completions`; OpenAI-compatible.
- `OpenRouterProvider` — `https://openrouter.ai/api/v1/chat/completions`; OpenAI-compatible multi-model router (`provider/model` naming).
- `OpenRouterDecisionsProvider` — `https://openrouter.ai/api/alpha/decisions` (default model `typesafe/jev-1.14`); overrides `analyze()`: sends question ids (`scam`, `tag_<index>`) instead of a prompt, caps body at `MAX_BODY_CHARS` (20000), maps `noul`-type answers to per-tag probabilities (`readTagProbabilities`, `noulProbability`), thresholds via `getTagThreshold(settings.additionalConfig.tagThreshold`, default `DEFAULT_TAG_THRESHOLD` 0.6)`.
- `ZaiPaaSProvider` — Z.ai PaaS `https://api.z.ai/api/paas/v4/chat/completions` (overridable via `settings.apiUrl`); OpenAI-compatible.
- `ZaiCodingProvider` — same Z.ai endpoint family, separate credential/model (`zaiCodingApiKey`/`glm-4.7` default); OpenAI-compatible.

## Flow
1. Instantiated by `ProviderFactory.createProviderAdapter(id)` with `ILogger` (most take `@inject('ILogger')` constructors, then `super()`).
2. Inherited `analyze()`: settings validation (API key format via `validateApiKeyFormat` where applicable; Ollama validates URL/model instead) → prompt build → HTTP POST with retry/timeout → provider-specific `parseResponse()` → shared `validateLLMResponse()`.

## Integration
- Consumed by: `ProviderFactory` registry only (never instantiated elsewhere).
- Depends on: `../BaseProvider`, `../ProviderUtils`, `../PromptBuilder`, `../../interfaces/ILogger`, `core/analysis` + `core/config` legacy types, TSyringe.
