# src/domain/interfaces/

## Responsibility
Ports (Dependency Inversion): contracts the infrastructure layer implements.

## Files
- `ILogger.ts` - Logging abstraction (`debug/info/warn/error`, API-key masking).
- `ITagManager.ts` - Tag CRUD + message tag operations.
- `IClock.ts` - Time abstraction.
- `IRandom.ts` - Randomness abstraction.
- `index.ts` - Barrel export.

## Implementations
| Port | Implementation | Location |
| --- | --- | --- |
| `ILogger` | `ConsoleLogger` | `src/infrastructure/logger/ConsoleLogger.ts` |
| `ITagManager` | `ThunderbirdTagManager` | `src/interfaces/adapters/ThunderbirdTagManager.ts` |
| `IClock` | `SystemClock` | `src/infrastructure/system/SystemClock.ts` |
| `IRandom` | `CryptoRandom` | `src/infrastructure/system/CryptoRandom.ts` |

## Rules
- Domain code imports ports only - never concrete implementations.
- Registered under matching string tokens in `src/background/DIContainer.ts`.
