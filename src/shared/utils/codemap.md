# src/shared/utils/

## Responsibility
Pure helper functions shared by all layers: confidence math, email-part type guards, log sanitization, config validation, user-facing error message mapping, and queue status logging.

## Design
- `confidenceUtils.ts`: `ConfidenceLevel` enum (LOW/MEDIUM/HIGH with 70/80 cutoffs); conversions `confidenceToPercentage`/`percentageToConfidence` (0–1 ↔ 0–100, throwing on out-of-range); threshold logic `meetsThreshold`, `getEffectiveThreshold` (tag override → `DEFAULTS.minConfidenceThreshold`), `meetsTagThreshold`; formatting `formatConfidence`, `getConfidenceColor`; validators `isValidConfidence`, `validateTagThreshold`.
- `validationUtils.ts`: `isValidProvider` type guard against the `Provider` enum, `isHardcodedTag`, `isValidColor`, `validateCustomTagsThresholds`, `getConcurrencyLimit` (model override → provider override → `PROVIDER_DEFAULT_CONCURRENCY`), `validateConcurrencyConfig`.
- `loggingUtils.ts`: security-relevant sanitization — `sanitizeForLogging` (recursive, exact-match `SENSITIVE_FIELDS` masking, full redaction of `subject`/`response`, URL param masking, depth limit), `maskSensitiveValue`, `maskSensitiveUrlParams`, `sanitizeSettingsForLogging`, `validateApiKeyFormat`.
- `emailPartUtils.ts`: type guards `hasNestedParts`/`isPlainTextBody`/`isHtmlBody`/`isAttachment` and `convertHtmlToText` (via `html-to-text`, wordwrap 130).
- `errorMessages.ts`: `mapAnalysisErrorToUserMessage` (regex-maps raw provider errors to German notifications — raw text never reaches the UI) and `formatTagResultMessage`.
- `QueueLogger.ts`: single `logQueueStatus(logger, queue, context?)` helper.

## Flow
Called synchronously during analysis pipelines: email parts are guarded/converted before prompt building; provider responses pass through confidence threshold checks; every log payload passes `sanitizeForLogging`; failures surface via `errorMessages` in notifications.

## Integration
- Consumed by: `src/infrastructure` providers (loggingUtils is the most-imported shared module), application use cases (confidenceUtils, validationUtils), notification UI code.
- Depends on: `../types` (`Tag`, `Provider`, `AppConfig`, `EmailPart`), `../constants/TagConstants`, external `html-to-text`; `QueueLogger` additionally imports `ILogger`/`IQueue` as type-only interfaces from `@/domain` and `@/infrastructure` (documented exception to the no-layer-deps rule).
