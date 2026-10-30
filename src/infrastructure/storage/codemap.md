# src/infrastructure/storage/

## Responsibility
Feature data persistence on `messenger.storage.local`: `MetricsRepository` (analysis performance metrics) and `TagHistoryRepository` (tag-change history backing undo).

## Design
- Repository pattern, `@injectable`, both inject `'ILogger'`, `'IClock'` (`SystemClock`), `'IRandom'` (`CryptoRandom`) — timestamps/UUIDs come from injected ports, keeping classes testable.
- `MetricsRepository`: stores `AnalysisMetrics` under `METRICS_STORAGE_KEY`, newest-first `unshift`, hard trim to `MAX_METRICS_ITEMS`; aggregates via `AggregatedMetrics` and applies `PROVIDER_COST_RATES` for cost estimation.
- `TagHistoryRepository`: `TagHistoryItem` records (`addedTags`/`removedTags`/`previousTags`) under `TAG_HISTORY_STORAGE_KEY`; per-message trim to `MAX_HISTORY_PER_MESSAGE`; undo = `removeHistoryItem(id)`.
- Barrel `index.ts` currently exports `TagHistoryRepository` (MetricsRepository is imported by class path).

## Flow
1. `recordMetric(metric)` → `random.uuid()` id → read array → unshift → trim → `saveMetrics()` (throttled by caller batch flow).
2. `recordChange(messageId, added, removed, previous)` → history item with `clock` timestamp → store → trim per message; `getLatestForMessage(id)` returns the newest item for undo.
3. Both repositories fail soft: storage errors are logged and surfaced as empty arrays/defaults.

## Integration
- Consumed by: background analysis pipeline (metrics), `ApplyTags`/undo flows in the application layer (tag history).
- Depends on: `@/domain/interfaces` (`ILogger`, `IClock`, `IRandom`), `@/shared/types/Metrics`, `@/shared/types/TagHistory`, `messenger.storage.local`, TSyringe.
