# src/

## Responsibility
All extension source code, organized as hexagonal architecture.

## Layout (dependency rule: interfaces → application → domain ← infrastructure; shared importable by all)
| Directory | Responsibility | Details |
| --- | --- | --- |
| `background/` | TSyringe container bootstrap, Thunderbird event/message orchestration | [codemap](background/codemap.md) |
| `interfaces/` | Thunderbird adapters, message/event handlers, options UI | [codemap](interfaces/codemap.md) |
| `application/` | Use cases, analysis tracker, rate limiter, priority queue | [codemap](application/codemap.md) |
| `domain/` | Entities, value objects, ports, domain services, domain errors | [codemap](domain/codemap.md) |
| `infrastructure/` | LLM providers, caches, repositories, logger, config, system clock/randomness | [codemap](infrastructure/codemap.md) |
| `shared/` | Types, constants, error hierarchy, pure utils | [codemap](shared/codemap.md) |

## Integration
- Runtime wiring happens once in `background/DIContainer.ts`.
- Compiled by webpack into the background and options bundles; the extension ships
  no async chunks (see `ProviderFactory.ts` note on static provider imports).
