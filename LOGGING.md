# Logging Strategy Documentation

Describes the logging architecture as implemented in `src/infrastructure/logger/` and the sanitization rules that keep secrets and personal data out of logs. This version reflects the audit fixes from PR #27 (issues #1–#9, commit 8047ca9) and the follow-up masking fix (commit be6a707); it replaces the 2025-12-24 version, which described a since-moved file layout (`providers/utils.ts`, top-level `background.ts` functions).

## Logger Architecture

```
ILogger (src/domain/interfaces)          ← interface: debug/info/warn/error + maskApiKey
   │
   ├── ConsoleLogger                     ← the only active implementation (DI: 'ILogger')
   │      ├── shared output gate         ← enabled + minLevel, shared by ALL instances
   │      └── debugLogBuffer             ← ring buffer, mirrored to storage.session
   │
   └── LegacyLogger                      ← legacy, no active consumers
```

### ILogger

`ILogger` is defined in `@/domain/interfaces`; infrastructure and application code import it from there. Levels, from lowest to highest: `debug`, `info`, `warn`, `error`. Every message takes an optional context object, which is sanitized before output (see [Redaction Rules](#redaction-rules)).

### ConsoleLogger (`src/infrastructure/logger/ConsoleLogger.ts`)

- TSyringe `@injectable()`, registered under the `'ILogger'` token.
- Console output uses a `[LOG]` prefix; the context object is sanitized and JSON-stringified.
- A **module-level gate** `{ enabled, minLevel }` is shared by every `ConsoleLogger` instance, including the module-level `sharedLogger` used by non-DI call sites (`ProviderUtils`, `MemoryCache`). One `configure()` call at startup governs all logging paths (issue #3, issue #11).
- Every accepted entry is also pushed into the shared `debugLogBuffer` (already sanitized).

### Shared Output Gate (log gating)

`BackgroundScript.applyLoggingConfig()` applies the persisted config at startup:

| Config key (`appConfig`) | Effect |
|--------------------------|--------|
| `enableLogging` | Master switch — `false` discards **all** output (console and debug buffer) |
| `logLevel` | Minimum level: `'debug' \| 'info' \| 'warn' \| 'error'`; anything else falls back to `'debug'` |

If no stored config exists (or reading it fails), defaults apply: enabled, level `debug`. The gate is checked on every log call, so a config change takes effect for every logger instance after the next startup.

### DebugLogBuffer (`src/infrastructure/logger/DebugLogBuffer.ts`)

- Ring buffer capped at 2000 entries (FIFO; oldest evicted, `droppedCount` incremented).
- Entries: `{ ts, level, msg, ctx? }` — `ctx` is the context **already sanitized** by the source logger.
- Mirrored to `storage.session` under the key `debugLogs` with a 1000 ms trailing throttle, so the buffer **survives event-page suspend/wake** (ADR-0008). `storage.session` is feature-detected and requires Thunderbird 115+; without it the mirror is a no-op.
- On wake the persisted entries are merged back (prepend, re-cap) so nothing logged during startup is lost.
- The options page reads the buffer via the `getDebugLogs` runtime message (`src/interfaces/background/MessageHandler.ts`).

### LegacyLogger (`src/infrastructure/logger/LegacyLogger.ts`)

Legacy per-provider prefixed logger (`[PROVIDER] …`) with its own `LogLevel` enum and `maskApiKey`. **No code currently imports it**; it is kept only for reference. New code must use `ILogger`/`ConsoleLogger`.

## Redaction Rules

### Where sanitization happens

`ConsoleLogger` runs every context object through `sanitizeForLogging()` (`src/shared/utils/loggingUtils.ts`) — both for the console string and before handing the entry to the debug buffer. Sensitive data is therefore masked once, at the logger boundary, for **all** call sites.

### Field masking (partial)

Exact field-name match, case-insensitive (issue #2: exact matching so legitimate fields like `tagKey`, `cacheKey`, `key` are **not** masked). Masked values keep the first 7 and last 3 characters: `sk-1234…def`.

- API-key fields: `apiKey`, `api_key`, `api-key`
- Provider storage keys: `openaiApiKey`, `geminiApiKey`, `claudeApiKey`, `mistralApiKey`, `deepseekApiKey`, `zaiPaasApiKey`, `zaiCodingApiKey`, `openrouterApiKey` (the last added in commit be6a707)
- Secret carriers: `apiKeyHeader`, `authToken`, `auth`, `authorization`, `cookie`, `x-api-key`, `x-goog-api-key`, `token`, `access_token`, `refresh_token`, `id_token`, `password`, `secret`, `client_secret`, `credential`, `credentials`, `privateKey`, `private_key`, `sessionKey`

Values ≤ 10 characters are replaced with `***`, falsy values with `not set` (same format as `ILogger.maskApiKey()`).

### Field redaction (full)

`subject` and `response` are **redacted entirely**, not masked — email subjects are personal data, raw LLM responses may contain quoted email content (issue #2).

### Content redaction: length metadata only

Raw LLM output and email content are never logged. Provider logging sites emit **length metadata** instead:

- `validateLLMResponse()` logs the response type, string/JSON length, and empty flags — never the content (`src/infrastructure/providers/ProviderUtils.ts`).
- JSON parse failures log the error message and `responseLength` only (issue #2).
- `extractJson()` logs `startIdx`, `endIdx`, and `length` of the extracted JSON.

### URL parameter masking

`maskSensitiveUrlParams()` replaces the query parameters `key`, `token`, `api_key`, `apikey`, `secret`, `password` with `***` in logged URLs. (Since ADR-0010 the Gemini key travels in a header, not the URL.)

### Recursion safety

`sanitizeForLogging()` recurses into nested objects/arrays with a depth limit as circular-reference protection.

## runId Correlation

Every analysis run gets a correlation id (issue #7):

1. `AnalyzeEmail` generates `runId = crypto.randomUUID()` at the start of each run and passes it through the provider call chain (`BaseProviderAdapter`, `BaseProvider`, `ProviderUtils.retryWithBackoff` merges it into retry logs via `logContext`).
2. **Single-info / single-error logging** (issue #5): the outcome is logged exactly once, in `AnalyzeEmail`, with full context:
   - Success: `[INFO] Email analysis completed successfully` — `runId`, `messageId`, `providerId`, `tags`, `confidence`
   - Failure: `[ERROR] Email analysis failed` — `runId`, `messageId`, `providerId`, `error`
3. Lower layers log pass-through details at `debug` only, so one analysis produces one info/error line plus (at `debug` gate) traceable detail lines, all sharing the `runId`.

## Error Handling and User-Facing Display

### `logAndDisplayError(error, type, context, customMessage?)`

Defined in `src/infrastructure/providers/ProviderUtils.ts`. It extracts the error message, derives the severity, logs with context, and sends the error to the UI via a `{ action: 'showError', error }` runtime message ("Receiving end does not exist" is handled gracefully when the options page is closed).

- `ErrorType`: `API`, `PROVIDER`, `USER`, `SYSTEM`, `NETWORK`, `VALIDATION`
- `ErrorSeverity`: `CRITICAL` (persistent alert/dialog), `WARNING` (toast, auto-hide), `INFO` (status, auto-hide)

The options page (`options.ts`, `showError()`) renders a severity-styled overlay: CRITICAL in red and persistent, WARNING in orange and INFO in blue, auto-hidden after 5 seconds.

### Cache error handling (issue #8, commit 8047ca9)

`AnalysisCache` (`src/infrastructure/cache/AnalysisCache.ts`) no longer swallows cache errors silently — failures are logged at `debug` with the error name, and the analysis proceeds uncached.

## Best Practices

1. Inject `ILogger` (token `'ILogger'`) — do not instantiate loggers directly; use the `sharedLogger` only in non-DI modules.
2. Never log raw email content or raw LLM responses — log lengths, counts, and ids.
3. Never stringify settings wholesale; use `sanitizeSettingsForLogging()` / `sanitizeForLogging()`, and `maskApiKey()` for keys.
4. Pass `runId` through to lower-layer calls so retries and failures stay correlated.
5. Log outcome once at the orchestration layer (`AnalyzeEmail`); keep lower layers at `debug`.

## File Map

| File | Role |
|------|------|
| `src/domain/interfaces/ILogger.ts` | ILogger interface |
| `src/infrastructure/logger/ConsoleLogger.ts` | Active implementation + shared gate + `sharedLogger` |
| `src/infrastructure/logger/DebugLogBuffer.ts` | Ring buffer + `storage.session` mirror |
| `src/infrastructure/logger/index.ts` | Barrel export |
| `src/infrastructure/logger/LegacyLogger.ts` | Legacy, unused |
| `src/shared/utils/loggingUtils.ts` | `sanitizeForLogging`, `maskSensitiveValue`, `maskSensitiveUrlParams`, `sanitizeSettingsForLogging`, `validateApiKeyFormat` |
| `src/infrastructure/providers/ProviderUtils.ts` | `logAndDisplayError`, `ErrorType`, `ErrorSeverity`, metadata-only LLM logging |
| `src/background/BackgroundScript.ts` | `applyLoggingConfig()` — gate setup at startup |
| `src/interfaces/background/MessageHandler.ts` | `getDebugLogs` runtime message |
| `options.ts` | Error overlay (`showError`), debug log retrieval |
