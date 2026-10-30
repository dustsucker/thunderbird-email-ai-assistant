# src/shared/types/

## Responsibility
Canonical, dependency-free type contracts for the whole extension: provider configuration, tag model, email content shape, tag-undo history and analysis metrics. Single source of truth — consuming layers re-export rather than redefine.

## Design
- `ProviderTypes.ts`: `Provider` enum (10 providers incl. `OPENROUTER_DECISIONS`, `ZAI_PAAS`, `ZAI_CODING`); `ProviderConfig`, `AnalysisFeatures`, `ModelConcurrencyConfig`, composed into `AppConfig`/`DefaultConfig`; AI response contract `ITagResponse` (tags, confidence, reasoning, SPF/DKIM flags); defaults `DEFAULTS` (`provider: Provider.OLLAMA`, `minConfidenceThreshold: 70`) and `DEFAULT_CUSTOM_TAGS` (13 classification tags). Re-exports tag types from `TagTypes.ts`.
- `TagTypes.ts`: single source of truth for `Tag`, `ThunderbirdTag` (messenger API shape with `tag`/`ordinal`), `StorageCustomTags`, `CustomTags` (ReadonlyArray), `HardcodedTagKey` union, `HardcodedTags`.
- `EmailPart.ts`: recursive MIME tree `EmailPart`, `Attachment`, `ParsedEmail`, `StructuredEmailData`, `AnalysisData`, `PromptBuilderResult`.
- `TagHistory.ts`: `TagHistoryItem` (added/removed/previous tags per message) with `MAX_HISTORY_PER_MESSAGE` (10) and `TAG_HISTORY_STORAGE_KEY`.
- `Metrics.ts`: `AnalysisMetrics`, `AggregatedMetrics` (per-provider breakdown), cost table `PROVIDER_COST_RATES`, `METRICS_STORAGE_KEY`, `MAX_METRICS_ITEMS`.

## Flow
No runtime flow — pure type/constant module. `DEFAULTS` seeds the config repository and options UI; `TagHistoryItem`/`AnalysisMetrics` are persisted via `messenger.storage.local` under their storage keys.

## Integration
- Consumed by: every layer — providers (`ITagResponse`, `ProviderConfig`), use cases (`AppConfig`, `TagHistoryItem`), infrastructure repositories (`CustomTags`, `Metrics`), options UI (`DEFAULTS`, `DEFAULT_CUSTOM_TAGS`), plus sibling shared folders (`constants/TagConstants`, `utils/validationUtils`, `utils/confidenceUtils`).
- Depends on: nothing outside `src/shared`; `ProviderTypes.ts` imports from `TagTypes.ts` only.
