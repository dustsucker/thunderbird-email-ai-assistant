# src/interfaces/adapters/

## Responsibility
Bridges between the Thunderbird WebExtension API and application ports.

## Files
- `ThunderbirdTagManager.ts` - Implements `ITagManager` (from
  `src/domain/interfaces/`): tag CRUD, message tag application/removal, key mapping
  (`buildTagKeyMap()`, `convertToInternalKey(s)`), `getTagsOnMessage()`.
- `ThunderbirdMailReader.ts` - Implements `IMailReader`: message retrieval/parsing.
- `index.ts` - Barrel export.

## Tag-Key Namespace (`_ma_` prefix)
- Every AI tag's internal Thunderbird key carries `TAG_KEY_PREFIX = '_ma_'`
  (`src/shared/constants/TagConstants.ts`); display names get `TAG_NAME_PREFIX = 'A:'`.
- Keys **without** the prefix belong to the user (non-AI tags). This namespace is
  reserved: this adapter never creates, modifies, or deletes unprefixed keys.
  Writes strip/replace only `_ma_`-prefixed keys and preserve all other tags;
  `getTagsOnMessage()` reports only `_ma_`-prefixed keys (prefix stripped), so
  unprefixed keys are treated as non-AI by definition.
- Unknown keys fall back to `_ma_unknown_tag`.

## Integration
- Registered as `'ITagManager'`/`'IMailReader'` in `src/background/DIContainer.ts`.
- Tested via `test/integration/tagApplication.test.ts` and adapter-related suites.
