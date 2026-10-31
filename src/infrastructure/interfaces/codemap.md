# src/infrastructure/interfaces/

## Responsibility
Infrastructure-level interface contracts (no deprecated aliases anymore -
`ILogger`/`ITagManager` live canonically in `src/domain/interfaces/`).

## Files
- `IProvider.ts` - AI provider contract for email analysis (implemented via
  `BaseProviderAdapter`).
- `ICache.ts` - Generic cache with TTL (implemented by `MemoryCache`).
- `IConfigRepository.ts` - Configuration persistence (implemented by
  `StorageLocalConfigRepository`).
- `IMailReader.ts` - Email reading/parsing (implemented by `ThunderbirdMailReader`).
- `IQueue.ts` - Priority queue (implemented by `PriorityQueue`).

## Rules
- Infrastructure implements these; application/domain depend only on the interfaces.
- DI registrations: `src/background/DIContainer.ts`.
