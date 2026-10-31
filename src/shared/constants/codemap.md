# src/shared/constants/

## Responsibility
Extension-wide constant definitions.

## Files
- `TagConstants.ts` - Tag configuration: `TAG_KEY_PREFIX = '_ma_'` (reserved namespace
  for AI tag keys - unprefixed keys belong to the user), `TAG_NAME_PREFIX = 'A:'`,
  `HARDCODED_TAGS` (is_scam, spf_fail, dkim_fail, tagged), helper
  `getHardcodedTagsAsArray()`.
- `PromptConstants.ts` - Analysis prompt building blocks: `PROMPT_BASE` (instruction
  set), `MAX_BODY_CHARS = 25_000` (body cap sent to providers).
- `index.ts` - Barrel export.

## Integration
- TagConstants: consumed by `ThunderbirdTagManager` and tag use cases.
- PromptConstants: consumed by `PromptBuilder` (`src/infrastructure/providers/`).
