# src/domain/services/

## Responsibility
Stateless-ish domain services for logic that doesn't belong to a single entity: `TagService` (tag reconciliation between configured tag definitions and Thunderbird's tag registry) and `EmailContentExtractor` (MIME-tree parsing and AI prompt assembly).

## Design
- TSyringe singleton services: both classes annotated `@singleton()` with `@inject('ILogger')` constructor injection (`TagService` additionally `@inject('ITagManager')`).
- Repository-mediated sync in `TagService`: `ensureTagsExist()` diffs `getAllTagConfigs()` (hardcoded tags `is_scam`, `spf_fail`, `dkim_fail`, `tagged` + stored `defaultCustomTags` like `is_business`) against `ITagManager.getAllTags()`, matching by `tagKeyPrefix '_ma_'` / `tagNamePrefix 'A:'` in `checkTagExists`/`findThunderbirdTag`.
- Runtime type guards as validation boundary: `isThunderbirdTag` (checks key/tag/color regex `/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/`/ordinal), `isThunderbirdTagArray`, `isValidStorageCustomTags` — invalid data degrades to `hardcodedTags` fallback instead of throwing.
- Recursive descent parsing in `EmailContentExtractor.findEmailParts`: `hasNestedParts` → recurse; classifies leaves with `isPlainTextBody`/`isHtmlBody`/`isAttachment`; HTML wins over text and goes through `convertHtmlToText`.
- Template rendering: `buildPrompt` substitutes `{headers}`, `{body}`, `{attachments}` placeholders and appends per-tag prompt instructions from `CustomTags`; `truncateText` caps prompt size.

## Flow
1. Startup: `ensureTagsExist()` → `getAllTagConfigs()` (storage via optional `getCustomTags(defaults)`, else `defaultCustomTags`) → for each config, `checkTagExists` → `createTag('A:' + name, color)` if missing.
2. Analysis: `findEmailParts(parts) → ParsedEmail { body, attachments }` → `buildPrompt(structuredData, customTags, promptTemplate) → PromptBuilderResult`.
3. Errors at every stage are caught, logged via `ILogger.error`, and met with safe fallbacks.

## Integration
- Consumed by: `src/application/use-cases/ExtractEmailContentUseCase.ts`, `src/background/DIContainer.ts`, `src/background/BackgroundScript.ts`, `core/tags.ts`, integration tests (`test/integration/tagApplication.test.ts`).
- Depends on: `@/domain/interfaces` (ILogger, ITagManager), `@/shared/types/TagTypes`, `@/shared/types/EmailPart`, `@/shared/types/ProviderTypes`, `@/shared/utils/emailPartUtils`, `tsyringe`. Note: `TagService` uses the `Tag` type from shared types, not the `Tag` entity class.
