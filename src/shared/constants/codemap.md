# src/shared/constants/

## Responsibility
Immutable configuration values and prompt templates shared across layers: tag-key conventions, system tag definitions, and the AI analysis prompt scaffolding.

## Design
- `TagConstants.ts`: `TAG_KEY_PREFIX` (`'_ma_'`) and `TAG_NAME_PREFIX` (`'A:'`) namespace AI-generated tags inside Thunderbird; `HARDCODED_TAGS` is a `HardcodedTags` record of the four system tags (`is_scam`, `spf_fail`, `dkim_fail`, `tagged`); `HARDCODED_TAG_KEYS` (derived via `Object.keys`) and helper `getHardcodedTagsAsArray()`.
- `PromptConstants.ts`: `PROMPT_BASE` — the analysis prompt template with `{headers}`, `{body}`, `{attachments}` placeholders plus the "DEFINED TAGS" contract.
- `ProviderConstants.ts`: system prompts `ANALYSIS_SYSTEM_PROMPT`, `ANALYSIS_SYSTEM_PROMPT_ZAI` (stricter JSON-only wording), `ANALYSIS_SYSTEM_PROMPT_DETAILED` (embeds the JSON schema example). Note: this file is intentionally not re-exported through `index.ts`.

## Flow
Prompt templates are interpolated by prompt builders (headers/body/attachment data + tag descriptions) before being sent to providers; tag prefixes are applied when mapping AI tag keys to Thunderbird tag keys and back.

## Integration
- Consumed by: provider implementations in `src/infrastructure` (system prompts), prompt builders, tag managers, and `src/shared/utils/validationUtils` (imports `HARDCODED_TAG_KEYS` for the `isHardcodedTag` guard).
- Depends on: `../types/TagTypes` (`HardcodedTags`, `Tag`) — the only dependency, type-only.
