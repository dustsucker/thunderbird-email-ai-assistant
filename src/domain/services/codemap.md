# src/domain/services/

## Responsibility
Domain services: cross-entity business logic without identity or state.

## Files
- `TagService.ts` - Tag reconciliation logic (`ensureTagsExist()`: make sure required
  tags exist before application).
- `EmailContentExtractor.ts` - Parses MIME part lists into structured content
  (`findEmailParts()`), skipping attachments.

## Integration
- Pure domain logic; infrastructure-independent. Used by use cases
  (`ExtractEmailContentUseCase`, `ApplyTagsToEmail`); tested in `test/domain/services/`.
