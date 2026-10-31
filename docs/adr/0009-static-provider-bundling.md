# ADR-0009: Static Bundling of All Providers

## Status

Accepted (2026-08-23, commit eca554d)

## Context

`ProviderFactory` originally loaded provider implementations lazily via a `PROVIDER_LOADERS` map of dynamic `import()` calls. Webpack compiled each provider into its own async chunk (`provider-openai-bundle.js`, `provider-claude-bundle.js`, …) that was fetched at runtime on first use.

This breaks in a packaged MailExtension: an `.xpi` ships exactly the files present in the package, and a MailExtension background page cannot reliably fetch async chunks. In the packaged extension the chunk requests returned **404**, so every provider load failed at runtime even though `npm run build` and development mode worked. The failure only appeared after packaging, which made it easy to miss in development.

## Decision

All providers are **statically imported and bundled into the background script** (commit eca554d):

1. `ProviderFactory` imports every provider class at the top of the module and resolves implementations from a static registry (`PROVIDER_REGISTRY: ReadonlyMap<string, ProviderConstructor>`, ten entries: openai, claude, gemini, mistral, ollama, deepseek, openrouter, openrouter-decisions, zai-paas, zai-coding).
2. `getProvider()` remains `async` for API compatibility but resolves synchronously from the map — no runtime code loading.
3. The per-provider chunk emission was removed (the `provider-*-bundle.js` files are gone).

This is a hard rule for the infrastructure layer, recorded in `src/infrastructure/AGENTS.md`: **no `import()` / code-splitting in extension code**.

## Consequences

### Positive

- **The background bundle is self-contained**: what works in development works in the packaged `.xpi`; no chunk 404s.
- **Simpler factory**: the loader map, async loading states, and chunk-error handling were removed (the commit nets ~83 deleted lines across the repository).

### Negative

- **Larger background bundle** regardless of which provider the user configures.
- **No lazy provider onboarding**: a new provider must be added to the static registry and is part of every build.

### Mitigations

- The registry is a single `ReadonlyMap`; adding a provider is one import plus one entry (see `src/infrastructure/AGENTS.md` checklist).

## References

### Key Files

- `src/infrastructure/providers/ProviderFactory.ts` — static imports, `PROVIDER_REGISTRY`
- `src/infrastructure/providers/index.ts` — module note: "no async chunks — MailExtensions cannot ship split chunks in an xpi"
- `src/infrastructure/AGENTS.md` — "Factory Pattern (ProviderFactory)" rule against code-splitting
- Commit `eca554d` — "fix: statically bundle all providers to prevent chunk 404 in packaged extension"

### Related ADRs

- [ADR-0003: Multi-Provider LLM Strategy](0003-multi-provider-strategy.md)
