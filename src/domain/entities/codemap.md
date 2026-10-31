# src/domain/entities/

## Responsibility
Business entities with identity and mutable state.

## Files
- `Email.ts` - Email entity: id, addresses, subject/body, attachments, flags;
  tag state with `flagLowConfidence()` for low-confidence classifications.
- `Tag.ts` - Tag entity with validation and Thunderbird conversion.

## Rules
- Entities have identity (id) and equality by ID; mutation only through methods.
- No imports from infrastructure or application.

## Integration
- Constructed/updated by use cases from validated value objects; tested in
  `test/domain/` (via service and value-object suites).
