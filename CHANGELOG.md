# Changelog

All notable changes to this project are documented in this file. Version numbers
mirror `manifest.json` (the repository has no release tags; dates are taken from
the commit history). Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

The former 1.0.0 entry (added 2026-03-01) advertised a Bayes classifier that never
existed in this codebase and has been rewritten below based on the actual history.

## [Unreleased] — as of 2026-10-31

Everything below landed after the 1.0.4 manifest bump (2025-12-24). `manifest.json`
still reads 1.0.4; intermediate packaged builds (notably 2026-08-23) already carried
parts of this.

### ⚠️ Upgrade notes for existing installations (migration)

1. **Permissions.** Host access is no longer blanket `http(s)://*/*`. All cloud API
   origins (OpenAI, Gemini, Anthropic, Mistral, DeepSeek, OpenRouter, Z.ai) and the
   local Ollama origins (`http(s)://localhost`, `http(s)://127.0.0.1`) are now
   *optional host permissions* (manifest `optional_host_permissions`; commits
   `5e3c866` + `239d70b`). **After upgrading, you must grant the origin of your
   chosen provider once** — the extension requests it at runtime and Thunderbird
   shows the corresponding permission prompt. The content security policy was
   narrowed accordingly (`connect-src` allowlist, now also covering
   `https://localhost` / `https://127.0.0.1`).
2. **Tag behavior.**
   - Response parse errors abort the analysis and surface an error instead of
     writing fabricated or empty tags (issue #28; `ProviderUtils.ts`, `BaseProvider`).
   - Tags are written through the real Thunderbird tag APIs; tags you applied
     yourself are preserved when the extension updates AI tags (commit `42729e0`).
   - The hardcoded "AI Analyzed" tag was removed (commit `83b4814`).
   - Undo works: a context-menu entry "Undo tag changes" reverts AI tag changes
     per message (issue #31).
   - Decisions-provider tags (e.g. `is_scam` from the OpenRouter Decisions provider)
     are applied even when no custom tags are configured.
   - Batch runs report an explicit status (`success` / `partial` / `error`) plus a
     `skippedCount` for already-analyzed emails (issue #29).
3. **Settings.**
   - The Ollama URL must point at `http(s)://localhost` or `http(s)://127.0.0.1`;
     other hosts are rejected (issue #36). HTTPS localhost is now reachable too
     (CSP and optional permissions updated).
   - Configuration lives in a `storage.local`-backed repository
     (`IndexedDBConfigRepository` → `StorageLocalConfigRepository`). Legacy
     `processed_*` tracking keys are migrated once on first use (commit `5e3c866`).
   - Storage read errors abort the current analysis loudly instead of silently
     falling back to defaults; only a genuinely missing configuration counts as
     "not configured" (`ConfigNotSetError`, issue #33).

### Added

- OpenRouter provider with attribution headers (commit `76c7198`).
- OpenRouter Decisions provider for confidence-gated tagging, incl. per-call parse
  context, `is_scam` tag and schema-drift guard (commits `0a6c7ce`, `886c715`, PR #23).
- Confidence thresholds: global and per-tag minimum confidence, low-confidence
  flagging and review UI (auto-claude feature line, merged `279745b`, Jan 2026).
- Debug tab in the options page: live queue view, log download, toolbar batch badge
  (commit `75bbf0c`), plus a tag-apply history view (last 100 applications, storage
  key `tagApplyHistory`, commit `c881792`).
- German user-facing notifications for analysis feedback (commit `f48d406`).
- Error surfacing for analyses: errors reach the UI via a runtime message, with a
  Thunderbird notification fallback when no UI channel is alive (issue #18).
- BaseProvider test suite covering Retry-After handling and AbortSignal (commit `668998e`).

### Changed

- **Breaking:** the legacy `core/` module directory was deleted; its types moved to
  the canonical `src/` locations. Imports of `core/*` no longer resolve (commit `c83fa78`).
- Migrated from Manifest V2 to Manifest V3 (commit `4e96540`), added the
  `messagesModifyPermanent` permission (commit `b8ec9e3`), and fixed MV3 event-page
  compatibility: tracker messenger probe, menu re-registration, background handling
  (commit `e482bf7`).
- Provider responses are validated strictly: schema drift and parse failures throw
  instead of producing a fake success (issue #28).
- Tag reads use the real `getTagsOnMessage` API instead of bookkeeping guesses
  (issue #32).
- Prompt hardening: untrusted email bodies are sanitized (code fences stripped) and
  hard-capped at 25,000 characters as a prompt-injection and cost guard
  (issue #30, `MAX_BODY_CHARS`).
- OpenRouter Decisions confidence factors in the scam probability, so a scam-only
  finding is not gated to 0 despite passing its internal check (commit `50b20ce`).
- Storage read failures fail loud (`ConfigNotSetError` for missing config only,
  issue #33); batch runs surface `success`/`partial`/`error` + `skippedCount`
  (issue #29); undo wired into the message-list context menu (issue #31).
- Options page redesign: honest empty states, accessible dialogs/tabs, dark mode,
  German copy (commits `6961d30`, `e0c3811`), honest connection-test results
  (commit `c86651c`).
- Logging audit: API-key masking (including the `openrouterapikey` storage key),
  log gating, per-run `runId` correlation, single error/info log per run, cache
  error handling (commits `8047ca9`, `be6a707`).
- Configuration repository on `storage.local` with a shared `ProviderSettingsService`;
  Gemini authenticates via header instead of URL query; analysis-tracker id set
  capped at 5,000 entries; legacy `processed_*` keys migrated (commit `5e3c866`).
- Provider HTTP handling: retry honoring `Retry-After`, timeout retries capped,
  `AbortError` propagated unwrapped, confidence normalization, safe JSON extraction
  (commits `fe0852a`, `5e3c866`).
- Folder listing paginated and based on `getDisplayedMessages`; memory cache bounded
  to 500 entries with FIFO eviction; analysis tracking moved to storage (commits
  `a1ee7a2`, `80d98f4`, `18a809b`).
- All providers statically bundled to prevent chunk 404s in packaged builds
  (commit `eca554d`).
- Background script modularized (937 to ~75 lines) with comprehensive provider unit
  tests (commits `6547b2f`, `13a4db3`, March 2026 refactor).

### Removed

- Blanket host permissions `http://*/*` + `https://*/*` in favor of explicit
  optional host permissions (commits `5e3c866`, `239d70b`).
- Hardcoded "AI Analyzed" tag (commit `83b4814`).
- Dead code: `domain/events/`, `ProviderConstants`, alias interfaces, the unused
  `naive-bayes` dependency, and the dead `EmailContentExtractor.buildPrompt` route
  (commit `9ce78e3`).
- Dead options-page implementations and stale artifacts (`AnalysisResultsUI`,
  `ARCHITECTURE.md.backup`, stale zip) (commits `7af9cdc`, `5e3c866`).

## [1.0.4] – 2025-12-24

- TypeScript migration of the provider layer (tsconfig, webpack, `providers/*.ts`).
- Z.ai integration (new `zai` provider) with timeout and parsing fixes
  (commits `d3c91a5`, `5e02dfd`, `528810a`).
- Provider object-oriented architecture rework with new options-UI features
  (commit `5e02dfd`).
- Email-analysis prompt and logging refactor (commit `c476c7d`).
- E2E tests with mock and real providers (commit `b394e5f`).
- Packaging scripts added (`scripts/package.js`, `scripts/clean.js`).

## [1.0.3] – 2025-07-26

- Manifest V2: dropped the `messagesModify` permission; the Ollama origin
  `http://localhost:11434/api/generate` became a fixed permission; optional
  permissions consolidated to blanket `http(s)://*/*` (commit `f1c70e3`).
- Build: `web-ext` ignore list extended (commit `f1c70e3`).

## [1.0.2] – 2025-07-09

- Dependencies pinned via `package-lock.json`; `.gitignore` added (commit `838acbc`).

## [1.0.1] – 2025-07-07

- First state tracked in this repository (initial import, Manifest V2):
  multi-provider LLM tagging (Ollama, OpenAI, Gemini, Claude, Mistral, DeepSeek),
  custom tags synced into Thunderbird using the `_ma_` key prefix, automatic
  analysis of incoming mail (commit `d40cc45`).

## [1.0.0] – before 2025-07-07 (corrected entry)

- Initial public release. Multi-provider LLM email tagging with custom tags
  (user-defined keys, colors and prompts) and automatic processing of incoming
  messages; custom tag keys are mapped into Thunderbird's internal tag system via
  the `_ma_` prefix.
- **Correction (2026-10-31):** the previous entry claimed a "Bayes classifier
  system" for local pre-classification and five additional fixed tags
  (newsletters, promotions, social, shipping, financial). No such classifier ever
  existed in this codebase — the `naive-bayes` dependency was added unused in early
  2026 and removed again (commit `9ce78e3`) — and those fixed tags are not part of
  the hardcoded tag set (`is_scam`, `spf_fail`, `dkim_fail`, `tagged`).
