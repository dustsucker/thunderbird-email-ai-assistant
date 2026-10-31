# src/infrastructure/storage/

## Responsibility
Repositories for history and metrics, persisted via `browser.storage.local`.

## Files
- `MetricsRepository.ts` - Persists/aggregates analysis metrics
  (`src/shared/types/Metrics.ts`).
- `TagHistoryRepository.ts` - Per-message tag history
  (`src/shared/types/TagHistory.ts`, capped per message).
- `TagApplyHistoryRepository.ts` - Tag-apply undo history used by
  `UndoTagChanges` to restore previous tag states.
- `index.ts` - Barrel export.

## Integration
- All `@injectable()`; registered in `src/background/DIContainer.ts`.
- Tested in `test/infrastructure/storage/`.
