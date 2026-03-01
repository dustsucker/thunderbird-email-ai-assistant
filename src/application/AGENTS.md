# Agent Guidelines for Application Layer

## Purpose

The Application Layer contains use cases and services that orchestrate domain objects
to perform business operations. It coordinates workflows, manages transactions, and
serves as the bridge between presentation and domain layers.

## Files

### Use Cases (`use-cases/`)

- **AnalyzeEmail.ts** - Orchestrates single email analysis workflow: retrieval, content
  extraction, AI provider analysis, caching, and tag application
- **AnalyzeBatchEmails.ts** - Batch email analysis with priority queue, progress tracking,
  cancellation support, and concurrent processing
- **ApplyTagsToEmail.ts** - Tag management including validation, creation, and application
  to email messages
- **index.ts** - Barrel export for use cases and interface re-exports

### Services (`services/`)

- **EmailAnalysisTracker.ts** - Tracks analyzed emails using X-AI-Analyzed header with
  fallback to storage.local
- **RateLimiterService.ts** - Token bucket rate limiting with per-model concurrency control
- **PriorityQueue.ts** - Priority-based queue implementation for batch processing
- **index.ts** - Service exports and interface re-exports

### Supporting Directories

- **dto/** - Data Transfer Objects (currently empty, reserved for future use)
- **ports/** - Application ports/interfaces (currently empty, uses infrastructure interfaces)

## Rules

1. **Orchestration Only**: Use cases orchestrate domain objects and infrastructure services.
   No business logic belongs here - delegate to domain services.

2. **Dependency Injection**: All classes use `@injectable()` decorator and receive
   dependencies via `@inject()` in constructors. Register in tsyringe container.

3. **Interface Dependencies**: Depend on abstractions (IXxx interfaces), not concrete
   implementations. Interfaces live in `infrastructure/interfaces/`.

4. **Single Responsibility**: Each use case handles one user action. Services provide
   reusable cross-cutting functionality.

5. **Event Publishing**: Use EventBus from domain layer for decoupled communication.
   Publish events like `EmailAnalyzedEvent`, `TagAppliedEvent`, `ProviderErrorEvent`.

6. **Error Handling**: Wrap and re-throw errors with descriptive messages. Log via
   ILogger before throwing. Non-fatal errors should be logged, not thrown.

## Patterns

### Use Case Pattern

```typescript
@injectable()
export class AnalyzeEmail {
  constructor(
    @inject('IMailReader') private readonly mailReader: IMailReader,
    @inject('ITagManager') private readonly tagManager: ITagManager,
    @inject('ILogger') private readonly logger: ILogger
    // ... other dependencies
  ) {}

  async execute(messageId: string, config: AnalyzeEmailConfig): Promise<AnalyzeEmailResult> {
    // 1. Validate input
    // 2. Retrieve data via interfaces
    // 3. Delegate to domain services
    // 4. Persist changes
    // 5. Publish events
    // 6. Return result
  }
}
```

### Application Service Pattern

```typescript
@injectable()
export class RateLimiterService {
  constructor(@inject('ILogger') private readonly logger: ILogger) {}

  async acquire<T>(provider: string, requestFn: () => Promise<T>, priority: number): Promise<T> {
    // Queue management, token consumption, execution
  }
}
```

### DTO Pattern

```typescript
// Input DTOs define configuration options
export interface AnalyzeEmailConfig {
  cacheTtl?: number;
  forceReanalyze?: boolean;
  applyTags?: boolean;
}

// Output DTOs define result structure
export interface AnalyzeEmailResult {
  messageId: string;
  tags: string[];
  confidence: number;
  fromCache: boolean;
}
```

## Conventions

- Use section comments (`// ===`) to organize code blocks
- Comprehensive JSDoc with `@param`, `@returns`, `@throws`, `@example`
- Use `readonly` for injected dependencies
- Prefix private methods, keep public API minimal
- Re-export types from index files for clean imports
