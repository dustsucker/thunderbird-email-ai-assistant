# src/interfaces/

## Responsibility
Hexagonal entry layer: Thunderbird adapters and UI. The only layer that touches the
`messenger`/`browser` APIs directly.

## Design
- Adapters implement domain ports (`ITagManager`, `IMailReader`) and delegate to
  application use cases.
- Background handlers register/unregister listeners in `start()`/`stop()` for cleanup.
- `messenger` types are declared locally (see `types/thunderbird.d.ts`), not imported
  from external packages.
- AI tags are namespaced: every AI tag key is prefixed `_ma_` (`TAG_KEY_PREFIX`,
  `src/shared/constants/TagConstants.ts`); unprefixed keys belong to the user and are
  never modified (see `adapters/ThunderbirdTagManager.ts`).

## Layout
| Directory | Content | Details |
| --- | --- | --- |
| `adapters/` | ThunderbirdTagManager, ThunderbirdMailReader | [codemap](adapters/codemap.md) |
| `background/` | MessageHandler, EmailEventListener | [codemap](background/codemap.md) |
| `options/` | DebugTab (options-page debug panel) | [codemap](options/codemap.md) |
| `shared/` | ProviderSettingsService, UI components, styles | [codemap](shared/codemap.md) |

## Integration
- The options page itself is implemented in the root `options.ts`/`options.html`;
  background orchestration lives in `src/background/`.
- Tested under `test/interfaces/`, `test/background/`, `test/email-event-listener.test.ts`.
