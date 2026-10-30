# src/interfaces/adapters/

## Responsibility
Thunderbird WebExtension API adapters implementing the infrastructure port interfaces, so the application/domain layers never import `messenger` directly.

## Design
- **Adapter (ports & adapters)**: `ThunderbirdMailReader implements IMailReader`, `ThunderbirdTagManager implements ITagManager`; both are TSyringe `@injectable()` with constructor `@inject('ILogger')`.
- **Type Guard pattern**: `isThunderbirdTag()` / `isThunderbirdTagArray()` validate untyped API responses before use.
- `ThunderbirdMailReader` wraps `messenger.messages.getFull()`, `.get()`, `.list()`, converting `ThunderbirdMessagePart` trees into `IEmailPart`/`IEmailAttachment` (recursive `convertMessageParts`, `extractAttachmentsFromParts`); EML parsing and HTML stripping are simplified built-ins.
- `ThunderbirdTagManager` wraps `messenger.messages.tags.list/create/update/delete`, `messenger.messages.get/update`, and namespaces all AI tags with the `_ma_` prefix (`TAG_KEY_PREFIX` from `TagConstants`), preserving non-AI tags (e.g. `$label1`) via `replaceAiTags()`.

## Flow
1. Use cases resolve `IMailReader`/`ITagManager` from the DI container.
2. Read path: `getFullMessage(messageId)` → two `messenger.messages` calls → part conversion → body/attachment extraction.
3. Write path: `setTagsOnMessage()` → `convertToInternalKeys()` (via `buildTagKeyMap()` over `HARDCODED_TAGS` + `configRepository.getCustomTags()`) → `replaceAiTags()` read-modify-write of the message tag list.
4. `ensureTagExists()` is the idempotent create-or-return path used before tagging.

## Integration
- Consumed by: application use cases (`AnalyzeEmail`, `ApplyTags`), `MessageHandler` (via `ITagManager`), DI container registration in `background.ts`.
- Depends on: `@/infrastructure/interfaces` (`IMailReader`, `ITagManager`, `IConfigRepository`), `@/domain/interfaces` (ILogger), `@/shared/constants/TagConstants`.
