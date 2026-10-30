# src/domain/entities/

## Responsibility
Business entities with identity and lifecycle behavior: `Email` (message aggregate with tagging, attachment queries, and low-confidence classification flags) and `Tag` (tag definition with validation and Thunderbird format conversion). Also hosts the `Attachment` and `LowConfidenceFlag` structural interfaces.

## Design
- Entity pattern: identity (`Email.id`, `Tag.id`), guarded constructors throwing on empty id/name.
- `Email` mixes immutable identity with mutable state: `tags: Set<string>` mutated by `applyTag`/`removeTag`; `lowConfidenceFlags: Map<string, LowConfidenceFlag>` managed by `flagLowConfidence`/`removeLowConfidenceFlag`/`clearLowConfidenceFlags` with range validation (confidence 0–1, threshold 0–100).
- `Tag` uses immutable self-replacement (`withName`, `withColor`, `withSortKey`, `withDescription`, `enable`, `disable` return new instances) plus static factory methods `fromThunderbirdTag` and `createDefault`.
- Composition over value objects: `Email` holds `EmailSubject`, `EmailAddress`, `EmailBody`; `Tag` holds `TagKey`, `TagColor`; `equals` delegates to value equality.

## Flow
1. Caller constructs `Email` with id, value objects, attachments, tags (defaults: `attachments = []`, `tags = []`, `timestamp = new Date()`).
2. Queries: `hasAttachment`/`getPdfAttachments`/`getImageAttachments` (case-insensitive MIME match), `isFromSender`/`isFromDomain`, `isOlderThan`/`isNewerThan`/`getAgeInDays`, `hasTag`.
3. Mutation: `applyTag` normalizes (trim + lowercase) before adding; `flagLowConfidence` validates then stores by tagKey.
4. Projection: `toSummary()` serializes to a plain DTO including `hasLowConfidenceFlags`/`lowConfidenceFlagCount`.

## Integration
- Consumed by: `test/email-low-confidence.test.ts` (imports `Email`, `LowConfidenceFlag`); referenced conceptually by application use cases that build emails from `ThunderbirdMailReader` data.
- Depends on: `../value-objects/EmailAddress`, `EmailSubject`, `EmailBody`, `TagKey`, `TagColor`; `Tag` re-exports `ThunderbirdTag` from `@/shared/types/TagTypes`. No external/infrastructure imports.
