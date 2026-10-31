# src/shared/

## Responsibility
Cross-cutting, dependency-free building blocks: types, constants, the error
hierarchy, and pure utilities. Importable by every layer; contains no business logic.

## Rules
1. No side effects - utilities are pure functions.
2. No layer dependencies - never imports from infrastructure/providers/application.
3. Barrel exports through `index.ts` where present (`constants/`, `errors/`).

## Layout
| Directory | Content | Details |
| --- | --- | --- |
| `types/` | EmailPart, ProviderTypes, TagTypes, TagHistory, Metrics | [codemap](types/codemap.md) |
| `constants/` | TagConstants (`_ma_` prefix, hardcoded tags), PromptConstants | [codemap](constants/codemap.md) |
| `errors/` | DomainError/ApplicationError/InfrastructureError + hierarchies | [codemap](errors/codemap.md) |
| `utils/` | confidence, email-part, validation, error-message, logging utils | [codemap](utils/codemap.md) |

## Integration
- Tested in `test/shared/` plus root-level suites
  (`test/errorMessages.test.ts`, `test/loggingUtils.test.ts`).
