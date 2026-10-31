# ADR-0011: OpenRouter Decisions Provider with Confidence Gating

## Status

Accepted (2026-10-30, commit 0a6c7ce, PR #23)

## Context

Tag classification so far relied exclusively on chat-completion LLMs: the model returns a free-form tag list plus a self-reported confidence, and the extension gates tag application on that single number. OpenRouter additionally exposes a **decisions API** (`POST /api/alpha/decisions`) for decision models (e.g. `typesafe/jev`): instead of one chat completion, the caller submits a set of typed questions and receives a per-question probability. This fits per-tag classification better — each custom tag becomes its own yes/no decision with an explicit probability, instead of one opaque generation that must be JSON-parsed and trusted.

Two constraints shaped the design:

1. **Alpha API risk**: the response schema can drift; a silent parse degradation would produce empty "successful" analyses that get cached.
2. **Downstream gating**: `ApplyTagsWithConfidenceUseCase` applies tags only above a global confidence threshold, so the provider must produce an overall confidence that meaningfully reflects every accepted tag.

## Decision

A dedicated provider `openrouter-decisions` (`OpenRouterDecisionsProvider`) was added (commit 0a6c7ce):

1. **One `noul` question per custom tag plus a scam check.** Questions get stable ids (`tag_<index>` in the order the tags were passed, plus `scam`); the state payload carries subject, from, and a body capped at 20,000 characters. The provider overrides `analyze()` and parses the decisions response directly, because the generic chat-completion schema would drop `is_scam`.
2. **Client-side threshold.** A tag is accepted when its probability meets `additionalConfig.tagThreshold` (default 0.6, clamped to [0,1] by `getTagThreshold()`). A passed scam check is exposed as an `is_scam` tag (mapped to the Thunderbird key `_ma_is_scam` downstream).
3. **Conservative overall confidence.** Overall confidence is the **minimum** of all probabilities that passed the threshold (accepted tags and scam alike), so a borderline tag drags the whole result below the downstream gate — the weakest accepted link decides. A scam-only finding without accepted tags still gets its own probability as confidence instead of dying at the gate with 0.
4. **Fail loudly on schema drift.** Answers that are missing, empty, or yield no parseable tag probabilities throw an error rather than returning a fake empty success that would be cached.
5. **Local settings validation.** `validateSettings()` checks API-key format (`sk-or-` prefix, minimum length) and model presence locally — no extra network request per analysis.
6. **Registry and DI wiring.** The provider is registered statically under `openrouter-decisions` in `ProviderFactory` (token `provider:openrouter-decisions`) and in the shared provider settings defaults; the options page gains API key, free-text model id, and threshold fields.

## Consequences

### Positive

- **Explicit per-tag probabilities** instead of one self-reported confidence for the whole generation.
- **Cheap, honest validation** (local format check) and deterministic request shape.
- **Schema drift is detectable**: unparseable answers fail the analysis instead of poisoning the analysis cache.

### Negative

- **Alpha API dependency**: the endpoint and schema may change without notice; the guards throw but cannot adapt.
- **Weakest-link confidence**: one borderline accepted tag lowers the overall confidence for all tags in that run.
- **Body truncation**: emails beyond 20,000 characters are classified on truncated content.

### Mitigations

- Threshold is user-configurable per provider settings.
- `reasoning` in the response records all tag probabilities, the scam probability, the threshold, and the request cost, so gated-out tags remain diagnosable in logs.

## References

### Key Files

- `src/infrastructure/providers/impl/OpenRouterDecisionsProvider.ts` — question building, threshold handling, min-confidence gate, local `validateSettings()`
- `src/infrastructure/providers/ProviderFactory.ts` — static registry entry `openrouter-decisions`
- `src/interfaces/adapters/ThunderbirdTagManager.ts` — `_ma_` prefix mapping for Thunderbird tag keys
- Commit `0a6c7ce` — "feat: add OpenRouter decisions provider for confidence-gated tagging" (PR #23)

### Related ADRs

- [ADR-0003: Multi-Provider LLM Strategy](0003-multi-provider-strategy.md)
- [ADR-0009: Static Bundling of All Providers](0009-static-provider-bundling.md)
