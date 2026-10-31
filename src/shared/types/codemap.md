# src/shared/types/

## Responsibility
Shared type definitions used across all layers (no runtime logic beyond constants).

## Files
- `EmailPart.ts` - Email content types: EmailPart, Attachment, ParsedEmail, AnalysisData.
- `ProviderTypes.ts` - Provider enum, ProviderConfig, AppConfig, ModelConcurrencyConfig,
  DEFAULTS (defaults consumed via `isValidProvider`/`getConcurrencyLimit`).
- `TagTypes.ts` - Tag, ThunderbirdTag, StorageCustomTags, CustomTags,
  HardcodedTagKey/HardcodedTags.
- `TagHistory.ts` - Tag history persistence: TagHistoryItem, TagApplyHistoryEntry,
  storage keys and caps (MAX_HISTORY_PER_MESSAGE, MAX_TAG_APPLY_HISTORY).
- `Metrics.ts` - AnalysisMetrics, AggregatedMetrics, PROVIDER_COST_RATES,
  METRICS_STORAGE_KEY.

## Integration
- `ThunderbirdTag` is validated at trust boundaries with type guards (see
  `isThunderbirdTag` pattern, `test/tag-mapping-fix.test.ts`).
