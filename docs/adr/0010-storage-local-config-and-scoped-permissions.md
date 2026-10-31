# ADR-0010: storage.local Config Repository and Scoped Host Permissions

## Status

Accepted (2026-10-30, commit 5e3c866; issues #33 and #36)

## Context

Two problems motivated this decision:

1. **Misleading storage abstraction and silent config failures.** The configuration repository was named `IndexedDBConfigRepository` although it already persisted everything through `browser.storage.local`. Worse, callers could not distinguish *deliberately not configured* (first run — defaults are fine) from a *storage read failure or corrupt data* (must never silently become defaults, e.g. an empty tag set or wiped settings) (issue #33).
2. **Blanket host permissions.** The manifest requested `http://*/*` and `https://*/*` host permissions — full network access to every site — although the extension talks to at most seven cloud API endpoints plus a local Ollama. It also stored the Gemini API key in the URL query string.

## Decision

Commit 5e3c866 aligns names, error semantics, and permissions with reality:

1. **Rename to `StorageLocalConfigRepository`.** The class implements `IConfigRepository` over `browser.storage.local` (with a `chrome.storage.local` fallback) using three namespace keys: `providerSettings`, `customTags`, `appConfig`. Writes are serialized through an internal write queue to avoid lost-update races on read-modify-write sequences.
2. **`ConfigNotSetError` for "not configured" only.** A missing key throws `ConfigNotSetError`, which callers may treat as "use defaults". Storage read failures propagate as plain errors, and corrupt data (wrong types) throws — neither is silently converted to defaults (issue #33). `clearAll()` removes only the three keys owned by the repository, never the whole `storage.local` (which also holds API keys and the analysis tracker).
3. **Scoped, optional host permissions.** `host_permissions` is now empty; the seven cloud API origins (`api.openai.com`, `generativelanguage.googleapis.com`, `api.anthropic.com`, `api.mistral.ai`, `api.deepseek.com`, `openrouter.ai`, `api.z.ai`) and localhost/127.0.0.1 (HTTP and HTTPS, portless patterns) are declared in `optional_host_permissions`. The CSP `connect-src` is narrowed to exactly those origins. Origins are requested at runtime via `messenger.permissions.request({ origins })` when the user configures a provider in the options page; the Ollama match pattern is derived from the configured URL without a port, because portless patterns match any port and ports are not allowed in match patterns (issue #36).
4. **Gemini API key moved to the request header** instead of the URL query string, keeping the key out of URLs (and out of URL-shaped log output).

## Consequences

### Positive

- **Least privilege**: install-time permissions no longer cover the entire web; users grant exactly the API host they configure, at configuration time.
- **Honest config semantics**: a missing config and a failing store are distinguishable, so first run gets defaults while a broken store surfaces as an error.
- **Accurate naming**: the repository name says what it does.

### Negative

- **An extra permission prompt** per cloud provider during setup; a revoked origin breaks the provider until re-granted.
- **More repository contract surface**: callers must handle `ConfigNotSetError` explicitly.

### Mitigations

- `getPermissionOrigin()` in `options.ts` centralizes the provider→origin mapping and validates against the hosts actually declared in the manifest.
- The options page surfaces permission failures with actionable messages instead of a generic provider error.

## References

### Key Files

- `src/infrastructure/repositories/StorageLocalConfigRepository.ts` — `ConfigNotSetError`, write queue, scoped `clearAll()`
- `manifest.json` — `optional_host_permissions`, empty `host_permissions`, narrowed `connect-src`
- `options.ts` — `getPermissionOrigin()`, `messenger.permissions.request({ origins })`
- Commit `5e3c866` — "refactor: storage.local config repo, scoped host permissions, shared provider settings"

### Related ADRs

- [ADR-0002: Hexagonal Architecture with DI](0002-hexagonal-architecture-with-di.md) (repository pattern)
- [ADR-0008: MV3 Event Page Background](0008-mv3-event-page-background.md) (tracker persistence in `storage.local`)
