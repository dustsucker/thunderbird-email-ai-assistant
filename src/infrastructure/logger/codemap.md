# src/infrastructure/logger/

## Responsibility
Logging implementations for the domain `ILogger` port plus the debug-tab log buffer.

## Files
- `ConsoleLogger.ts` - Default `ILogger` implementation (registered as `'ILogger'`);
  emits debug/info/warn/error with masked context.
- `DebugLogBuffer.ts` - Injectable in-memory buffer of debug log entries
  (`DebugLogEntry`, level + masked context) backing the options-page debug tab;
  shared instance created in `src/background/DIContainer.ts`.
- `LegacyLogger.ts` - Legacy singleton `Logger` with `LogLevel` enum, kept for
  compatibility; do not use in new code.
- `index.ts` - Barrel export.

## Rules
- API keys and sensitive values must be masked before logging
  (`maskApiKey`, `src/shared/utils/loggingUtils.ts`).
- Tested in `test/infrastructure/logger/`.
