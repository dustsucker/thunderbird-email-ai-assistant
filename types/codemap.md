# types/

## Responsibility
Ambient (global) TypeScript type declarations for Thunderbird WebExtension APIs that are not covered by bundled library definitions. Kept global on purpose to avoid module import friction in code that calls the `messenger` object directly.

## Design
Single file `thunderbird.d.ts` with two `declare const` globals:
- `messenger` — the Thunderbird messenger API: `messages` (`onNewMailReceived`, `getFull`, `list`/`continueList`/`abortList` pagination, `update`, `tags` CRUD), `messageDisplay.getDisplayedMessages`, `storage.local`, `runtime` (`onInstalled`, `onSuspend`, `sendMessage`), `menus` (+`onClicked`), `browserAction`/`action` `onClicked`, `notifications.create`
- `browser` — only `runtime.lastError` for callback-style API checks
Supporting interfaces: `ThunderbirdFolder`, `FolderMenuOnClickData`, `Tab`, `MessageHeader`, `MessageList`, `MessageTag`

## Flow
Not executable code: the declarations are pulled in via `tsconfig` type roots/include and only shape compile-time checking. Runtime behavior comes from Thunderbird injecting the `messenger`/`browser` globals.

## Integration
- Consumed by: all layers calling `messenger.*` directly — notably `src/interfaces/adapters/ThunderbirdMailReader.ts`, `ThunderbirdTagManager.ts`, and `src/background/*` handlers
- Depends on: nothing (self-contained ambient declarations)
