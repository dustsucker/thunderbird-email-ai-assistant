# src/domain/value-objects/

## Responsibility
Immutable, self-validating primitives of the domain: `EmailAddress` (RFC 5322 regex, 254-char limit, lowercase normalization), `EmailSubject` (RFC 5322 998-char limit, truncation), `EmailBody` (1 MB cap, HTML stripping, URL/email extraction), `TagKey` (kebab/snake format `/^[a-z0-9_-]+$/`, reserved-key check), `TagColor` (3/6-digit hex, luminance/contrast math), `ApiKey` (length + control-char validation, masking). Barrel `index.ts` also re-exports the value-object errors.

## Design
- Value Object pattern: `readonly value`, equality by value (`equals`), validation in constructor, no identity.
- Static factory methods for non-throwing construction: `tryCreate`, `isValid`, `createOr` (EmailAddress), `empty`/`fromHtml`/`fromText` (EmailBody), `random`/`fromPalette` (TagColor), `fromDisplayName` (TagKey kebab-case conversion).
- Fail-fast constructors throw typed errors from `../errors/ValueObjectErrors` (`InvalidEmailAddressError`, `InvalidApiKeyError`, `InvalidTagColorError`) — except `EmailSubject` and `TagKey`, which throw plain `Error`.
- Secret hygiene in `ApiKey`: `toString()`/`toJSON()` return `masked` (e.g. `sk-p***f456`), never the raw value; provider sniffing via `isOpenAI`/`isGemini`/`isClaude`; `empty()` bypasses validation via `Object.create(ApiKey.prototype)`.
- Presentation helpers on `TagColor`: `to6Digit`, `toRgb`, `getLuminance` (0.299/0.587/0.114 weights), `getContrastColor` → `'black' | 'white'`.

## Flow
1. Raw string enters constructor → trim → normalize (lowercase/uppercase where applicable).
2. Validate (regex, length caps, character classes); failure throws the typed error.
3. Validated `value` frozen into the instance; downstream queries are pure (`contains`, `isFromDomain`, `isLight`, `isReserved`, `extractUrls`).

## Integration
- Consumed by: `../entities/Email` (EmailAddress, EmailSubject, EmailBody) and `../entities/Tag` (TagKey, TagColor); tested in `test/domain/value-objects/ApiKey.test.ts`, `TagColor.test.ts`, `EmailAddress.test.ts`.
- Depends on: `../errors/ValueObjectErrors` only. No shared-types or external imports.
