# ADR-0002: Hexagonal Architecture with Dependency Injection

## Status

Accepted

## Context

The Thunderbird Email AI Assistant is a MailExtension that needs to:

1. **Integrate with Thunderbird APIs** for email reading and tagging
2. **Support multiple LLM providers** (OpenAI, Claude, Gemini, Mistral, DeepSeek, Ollama, ZAI)
3. **Be testable** in isolation without real Thunderbird or API calls
4. **Be maintainable** as the codebase grows
5. **Support future expansion** with new providers or features

Without a clear architecture, we risk:
- Tightly coupled code that's hard to change
- Difficulty testing business logic in isolation
- Provider-specific code leaking into core logic
- Spaghetti dependencies that make the codebase hard to understand

## Decision

We adopt **Hexagonal Architecture** (also known as Ports and Adapters or Clean Architecture) with **TSyringe Dependency Injection**.

### Architecture Layers

```
┌─────────────────────────────────────────┐
│           Interfaces (Entry)            │  ← background.ts, options.ts
├─────────────────────────────────────────┤
│          Application (Use Cases)        │  ← AnalyzeEmail, ApplyTags
├─────────────────────────────────────────┤
│            Domain (Business)            │  ← Email, Tag, Events
├─────────────────────────────────────────┤
│        Infrastructure (External)        │  ← Providers, Cache, DB
└─────────────────────────────────────────┘
           Shared (Cross-cutting)          ← Types, Utils
```

### Dependency Rules

1. **Domain Layer** (`src/domain/`): Zero dependencies on external frameworks
2. **Application Layer** (`src/application/`): Depends only on Domain interfaces
3. **Infrastructure Layer** (`src/infrastructure/`): Implements Domain interfaces
4. **Interfaces Layer** (`src/interfaces/`): Adapts external world to Application

### Dependency Injection with TSyringe

We use [TSyringe](https://github.com/microsoft/tsyringe) for dependency injection:

```typescript
// Registration (in DIContainer.ts)
container.registerSingleton<ILogger>('ILogger', ConsoleLogger);
container.registerSingleton<ICache>('ICache', MemoryCache);

// Injection (in use cases)
@injectable()
export class AnalyzeEmail {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IMailReader') private readonly mailReader: IMailReader
  ) {}
}
```

### Alternatives Considered

| Alternative | Pros | Cons | Decision |
|------------|------|------|----------|
| **Plain MVC** | Simple, familiar | Doesn't separate concerns well, hard to test | Rejected |
| **No Architecture** | Fast to start | Becomes unmaintainable quickly | Rejected |
| **Event-Driven Only** | Very decoupled | Too complex for this use case | Rejected |
| **Layered Architecture** | Clear separation | Still allows domain to depend on infrastructure | Rejected |
| **Hexagonal + Inversify** | Powerful DI | Heavier, more boilerplate than TSyringe | Rejected |
| **Hexagonal + TSyringe** | Lightweight DI, good TypeScript support | Learning curve | **Accepted** |

## Consequences

### Positive

- **Testability**: Domain and Application layers can be tested with mock dependencies
- **Flexibility**: Easy to swap providers (e.g., OpenAI to Claude) without changing business logic
- **Clear boundaries**: Each layer has a specific responsibility
- **Dependency direction**: Dependencies point inward, protecting domain logic
- **DI benefits**: Loose coupling, easier testing, better separation of concerns

### Negative

- **More files**: Architecture requires more files and directories
- **Learning curve**: Developers need to understand Hexagonal Architecture
- **Boilerplate**: DI registration and interface definitions add overhead
- **Initial complexity**: Simpler features might seem over-engineered

### Mitigations

- Comprehensive AGENTS.md files in each directory explain the patterns
- Clear examples in the codebase for reference
- The structure pays off as the project grows

## References

### Key Files

- `src/domain/` - Core business logic with no external dependencies
- `src/application/use-cases/` - Use case orchestration
- `src/infrastructure/` - External service implementations
- `src/interfaces/` - Thunderbird adapters and UI
- `src/background/DIContainer.ts` - DI container setup

### Related ADRs

- [ADR-0003: Multi-Provider Strategy](0003-multi-provider-strategy.md)
- [ADR-0004: Event-Driven Domain Events](0004-event-driven-domain-events.md)

### External References

- [Alistair Cockburn - Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Robert C. Martin - Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [TSyringe Documentation](https://github.com/microsoft/tsyringe)
