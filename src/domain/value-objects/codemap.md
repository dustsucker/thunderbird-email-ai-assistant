# src/domain/value-objects/

## Responsibility
Immutable, self-validating value objects.

## Files
- `ApiKey.ts` - API key with format validation.
- `EmailAddress.ts` - Validated email address, case-insensitive equality.
- `EmailBody.ts` - Body with HTML/text handling.
- `EmailSubject.ts` - Subject with truncation.
- `TagColor.ts` - Hex color with contrast utilities.
- `TagKey.ts` - Tag key format validation.
- `index.ts` - Barrel export.

## Rules
- Immutable; equality by value; invalid input throws (typed errors from
  `../errors/ValueObjectErrors.ts`).

## Integration
- Used by entities and use cases to validate raw input at the domain boundary;
  tested in `test/domain/value-objects/`.
