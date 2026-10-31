# src/shared/utils/

## Responsibility
Pure utility functions - no side effects, no layer imports.

## Files
- `confidenceUtils.ts` - Confidence conversions (0-1 ↔ 0-100), formatting/levels/colors,
  threshold comparisons (`meetsThreshold`, `meetsTagThreshold`, `getEffectiveThreshold`).
- `emailPartUtils.ts` - EmailPart type guards (`hasNestedParts`, `isHtmlBody`,
  `isAttachment`) and `convertHtmlToText`.
- `validationUtils.ts` - `isValidProvider`, `isHardcodedTag`, color/threshold validation,
  concurrency config validation and `getConcurrencyLimit`.
- `errorMessages.ts` - `mapAnalysisErrorToUserMessage` (raw error → actionable user
  message), `formatTagResultMessage`.
- `loggingUtils.ts` - Log safety: `maskSensitiveValue`, `maskSensitiveUrlParams`,
  `sanitizeForLogging`, `sanitizeSettingsForLogging`, API key format validation.

## Integration
- Used by every layer; masking helpers are mandatory before logging credentials.
- Tested in `test/shared/utils/confidenceUtils.test.ts`,
  `test/errorMessages.test.ts`, `test/loggingUtils.test.ts`.
