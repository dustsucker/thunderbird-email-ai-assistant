# src/domain/errors/

## Responsibility
Typed domain errors for invalid value objects / domain rule violations.

## Files
- `ValueObjectErrors.ts` - Error classes for invalid value-object input, with type
  guards (e.g. invalid email address, invalid tag key, invalid API key).
- `index.ts` - Barrel export.

## Integration
- Thrown by `src/domain/value-objects/`; caught and wrapped by application use cases
  into the shared hierarchy (`src/shared/errors/`). Tested via
  `test/domain/value-objects/` and `test/shared/errors/Errors.test.ts`.
