# ADR-0008: MV3 Non-Persistent Background (Event Page)

## Status

Accepted (2026-08-23, commit e482bf7)

Supersedes the persistent-background decision of [ADR-0006](0006-manifest-v3-hybrid-approach.md). ADR-0006's other parts (manifest version 3, V3-compliant CSP) remain in force.

## Context

ADR-0006 kept `persistent: true` on the HTML background page as a temporary hybrid measure, citing immature Thunderbird Service Worker support. Thunderbird's Manifest V3 support instead offers a middle ground: a **non-persistent event page** — an HTML background page that is suspended when idle and reloaded on demand. Keeping the page persistent costs memory for the entire session and remains flagged as deprecated.

Moving to an event page changes the runtime contract: all in-memory state and DOM effects (registered menus, module-level singletons) are lost on suspend, and the page script re-runs from scratch on every wake.

## Decision

The background page is declared without `persistent`:

```json
"background": { "page": "background.html" }
```

Commit e482bf7 pairs this switch with event-page compatibility fixes:

1. **Idempotent menu registration.** Context menus persist across suspend/wake in Thunderbird MV3. `ContextMenuHandler.registerMenus()` is now async and awaits `menus.removeAll()` before re-creating the menus; otherwise `menus.create` fails with a duplicate-ID `lastError` on re-registration after wake (`src/background/ContextMenuHandler.ts`).
2. **Messenger API probe.** The bundled background page exposes the `messenger` API as a bare global. `EmailAnalysisTracker` probes `globalThis.messenger` first, then `browser.messenger`, then `chrome.messenger`, and throws a clear error if none is available (`src/application/services/EmailAnalysisTracker.ts`).
3. **Durable state moved to storage.** State that must survive suspend lives in extension storage: processed message IDs in `messenger.storage.local` (key `processedIds`, capped at 5000 entries), and the debug log ring buffer mirrored to `storage.session` (`src/infrastructure/logger/DebugLogBuffer.ts`).
4. **No source maps in production builds** (`devtool: false` in `webpack.config.js` for production), keeping the packaged artifact lean.

## Consequences

### Positive

- **Lower memory footprint**: the background is suspended when idle instead of living for the whole session.
- **MV3-conformant** without depending on the buggy Service Worker path ADR-0006 worried about.
- **Crash-safe state**: processed-ID tracking and debug logs survive suspend/wake (and restart, for the session-scoped buffer within the same Thunderbird session).

### Negative

- **In-memory state is ephemeral**: anything not persisted is lost on suspend; every wake re-runs the full initialization path.
- **More complex lifecycle code**: menu registration must remove-then-recreate; APIs must be probed defensively at each use.

### Mitigations

- Keep initialization idempotent and cheap; guard against double initialization (`BackgroundScript` warns and skips if already initialized).
- Persist any state whose loss would be visible (tracker IDs, debug buffer, configuration).

## References

### Key Files

- `manifest.json` — `background.page` without `persistent`
- `src/background/ContextMenuHandler.ts` — `registerMenus()` with `menus.removeAll()` pre-pass
- `src/application/services/EmailAnalysisTracker.ts` — messenger probe, `storage.local` persistence, 5000-ID cap
- `src/infrastructure/logger/DebugLogBuffer.ts` — `storage.session` mirror surviving event-page suspend/wake
- `webpack.config.js` — production `devtool: false`
- Commit `e482bf7` — "fix: event-page compatibility"

### Related ADRs

- [ADR-0006: Manifest V3 Hybrid Approach](0006-manifest-v3-hybrid-approach.md) (persistent-background part superseded by this ADR)
