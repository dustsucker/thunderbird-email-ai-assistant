# src/shared/

## Responsibility
Cross-cutting kernel of the hexagonal architecture: pure types, constants, error classes and utility functions importable by every layer (interfaces, application, domain, infrastructure). Holds no business logic and no side effects.

## Design
Four subfolders, each with a barrel where applicable:
- `types/` — canonical data contracts (`Provider` enum, `Tag`, `EmailPart`, `ITagResponse`, `AppConfig`, `AnalysisMetrics`) plus defaults (`DEFAULTS`, `DEFAULT_CUSTOM_TAGS`); no index barrel, consumers import per-file.
- `constants/` — single-source-of-truth constants (`TAG_KEY_PREFIX`, `HARDCODED_TAGS`, `PROMPT_BASE`, `ANALYSIS_SYSTEM_PROMPT*`) exported via `index.ts`.
- `errors/` — layered error hierarchy mirroring the architecture (`DomainError`, `InfrastructureError`, `ApplicationError` base classes with `code`/`cause`/`context` fields), unified through `errors/index.ts`.
- `utils/` — pure functions: confidence conversion, log sanitization, validation, HTML-to-text.

## Flow
Constants and types flow inward/outward as constructor parameters and DI tokens; errors propagate upward from infrastructure (provider calls) through application (use cases) to the interfaces layer. `utils/validationUtils` and `utils/confidenceUtils` mediate between user-facing 0–100 thresholds and provider 0–1 confidence values.

## Integration
- Consumed by: all layers — heaviest importers are `src/infrastructure` (providers use `ANALYSIS_SYSTEM_PROMPT*`, `loggingUtils.sanitizeForLogging`), `src/application` use cases (`EmailAnalysisError`, `confidenceUtils`), and config/options UI (`ProviderTypes`, `DEFAULTS`).
- Depends on: nothing internal except intra-shared imports; `utils/emailPartUtils` depends on the external `html-to-text` package, and `utils/QueueLogger` references `ILogger`/`IQueue` interfaces (import type only).
