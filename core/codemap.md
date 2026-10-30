# core/

## Responsibility

Legacy standalone module of the original email-AI implementation, now fully deprecated. All four files (`config.ts`, `cache.ts`, `tags.ts`, `analysis.ts`) are thin re-export shims with `@deprecated` JSDoc headers that forward to their migrated homes in `src/`. They contain no logic of their own and exist only for backward compatibility until remaining imports are updated.

## Design

- `config.ts` → re-exports `Tag`/`CustomTags` types from `src/shared/types/TagTypes`, `Provider`/`DEFAULTS`/`DEFAULT_CUSTOM_TAGS` from `src/shared/types/ProviderTypes`, constants from `TagConstants`/`PromptConstants`, validators from `src/shared/utils/validationUtils`; defines the deprecated `AllTags` alias.
- `cache.ts` → re-exports `AnalysisCache`, `analysisCache`, `hashEmail`, `simpleHash`, `isEmailFresh`, `normalizeHeaders`, `createCacheKey` from `src/infrastructure/cache/AnalysisCache`.
- `tags.ts` → re-exports `TagService` from `src/domain/services/TagService` plus tag types/constants.
- `analysis.ts` → re-exports `buildPrompt`/`truncateText` from `src/infrastructure/providers/PromptBuilder` plus `EmailPart`/`ParsedEmail`/`StructuredEmailData` types from `src/shared/types/EmailPart`.

**Import status: legacy-but-used.** Grep confirms 10 provider implementations in `src/infrastructure/providers/impl/` (OpenAI, Claude, Gemini, Mistral, Deepseek, Ollama, OpenRouter, OpenRouterDecisions, ZaiPaaS, ZaiCoding) still import `StructuredEmailData` from `core/analysis` and `CustomTags` from `core/config` via relative paths. All other `core/` references in `src/` are only migration comments/docs, not imports. Migration is functionally complete but not import-complete.

## Flow

1. All real logic lives in `src/` (hexagonal architecture, TSyringe DI).
2. Consumer imports a symbol via a `core/*` path.
3. The shim's `export ... from '../src/...'` forwards directly to the `src/` implementation — no wrapping, transformation, or branching.
4. Control/data flow at runtime is identical to importing from `src/` directly.

## Integration

- Consumed by: `src/infrastructure/providers/impl/*` (10 LLM providers, type-only imports of `StructuredEmailData` and `CustomTags`).
- Depends on: `src/shared/types/TagTypes`, `src/shared/types/ProviderTypes`, `src/shared/types/EmailPart`, `src/shared/constants/TagConstants`, `src/shared/constants/PromptConstants`, `src/shared/utils/validationUtils`, `src/infrastructure/cache/AnalysisCache`, `src/domain/services/TagService`, `src/infrastructure/providers/PromptBuilder`.
- Removal plan (per `core/AGENTS.md`): delete once provider imports are switched to `@/` paths.
