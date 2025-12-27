# Architecture

## Project Overview

The Thunderbird Email AI Assistant is a powerful and flexible Thunderbird MailExtension that provides AI-powered email analysis and tagging. It automatically processes incoming emails, sends them to a language model of your choice for analysis, and applies tags based on the model's response.

**Key Features:**
- Multi-provider LLM support (Ollama, OpenAI, Google Gemini, Anthropic Claude, Mistral, DeepSeek)
- Dynamic email analysis with header, body, and attachment extraction
- Fully configurable tagging system with custom tags and prompts
- Privacy-focused with local and cloud provider options
- Secure configuration using Thunderbird's runtime permissions API

---

## Architecture Principles

The project follows **Hexagonal Architecture** (Ports and Adapters) with the following principles:

### Core Principles

1. **Hexagonal Architecture**: Separation of concerns into distinct layers (domain, application, infrastructure, interfaces)
2. **Dependency Inversion**: High-level modules don't depend on low-level modules. Both depend on abstractions (interfaces)
3. **Dependency Injection**: Using TSyringe for runtime dependency injection with `@injectable()` decorators
4. **SOLID Principles**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion

### Layer Dependencies

```
┌──────────────────────────────────────────────────────┐
│                    Interfaces                        │  ← Entry Points
├──────────────────────────────────────────────────────┤
│                  Application                         │  ← Use Cases
├──────────────────────────────────────────────────────┤
│                    Domain                            │  ← Business Logic
├──────────────────────────────────────────────────────┤
│                Infrastructure                        │  ← Implementation Details
└──────────────────────────────────────────────────────┘

         Shared (Utilities, Constants, Types)  ← Cross-cutting
```

**Dependency Flow:** Interfaces → Application → Domain ← Infrastructure

---

## Directory Structure

```
src/
├── application/           # Application Layer (Use Cases)
│   ├── dto/              # Data Transfer Objects
│   ├── ports/            # Input/Output Ports (Interfaces)
│   ├── services/         # Application Services
│   │   └── PriorityQueue.ts
│   └── use-cases/        # Use Case Implementations
│
├── domain/               # Domain Layer (Business Logic)
│   ├── entities/         # Domain Entities
│   ├── events/           # Domain Events
│   ├── services/         # Domain Services
│   └── value-objects/    # Value Objects
│
├── infrastructure/       # Infrastructure Layer (External)
│   ├── cache/            # Cache Implementations
│   │   └── MemoryCache.ts
│   ├── config/           # Configuration
│   ├── interfaces/       # Core Interfaces
│   │   ├── ICache.ts
│   │   ├── ILogger.ts
│   │   ├── IProvider.ts
│   │   └── IQueue.ts
│   ├── logger/           # Logger Implementations
│   │   ├── ConsoleLogger.ts
│   │   ├── LegacyLogger.ts
│   │   └── index.ts
│   ├── persistence/      # Data Persistence
│   ├── providers/        # AI Provider Implementations
│   │   ├── BaseProviderAdapter.ts
│   │   ├── ProviderFactory.ts
│   │   ├── ProviderUtils.ts
│   │   └── Validator.ts
│   └── repositories/     # Repository Implementations
│
├── interfaces/           # Interface Layer (Adapters)
│   ├── adapters/         # External Adapters
│   ├── background/       # Background Script Integration
│   ├── options/          # Options Page Integration
│   └── types/            # Interface Type Definitions
│
└── shared/               # Shared Utilities
    ├── constants/        # Application Constants
    │   └── ProviderConstants.ts
    ├── types/            # Shared Type Definitions
    └── utils/            # Utility Functions
```

---

## Layer Descriptions

### Domain Layer

**Purpose**: Contains core business logic and entities. Has no dependencies on other layers.

- **entities/**: Core business entities (Email, Tag, Provider)
- **value-objects/**: Immutable value objects with validation
- **events/**: Domain events for event-driven architecture
- **services/**: Domain-specific business logic services

**Dependencies**: Only on shared types

### Application Layer

**Purpose**: Orchestrates use cases and coordinates domain objects. Contains application services.

- **use-cases/**: Application use case implementations (AnalyzeEmail, ApplyTags)
- **services/**: Application services (PriorityQueue)
- **ports/**: Input and output ports for external communication
- **dto/**: Data transfer objects for inter-layer communication

**Dependencies**: Domain layer, Infrastructure interfaces

### Infrastructure Layer

**Purpose**: Provides concrete implementations of interfaces defined in the domain/application layers.

- **providers/**: AI provider implementations (OpenAI, Claude, Ollama, etc.)
- **cache/**: Cache implementations (MemoryCache, RedisCache, etc.)
- **logger/**: Logger implementations (ConsoleLogger, LegacyLogger)
- **persistence/**: Database/file storage implementations
- **repositories/**: Repository pattern implementations
- **interfaces/**: Core system interfaces (IProvider, ICache, ILogger, IQueue)

**Dependencies**: Domain layer, Application interfaces, External libraries

### Interface Layer

**Purpose**: Adapters for external systems and user interfaces. Entry points into the application.

- **adapters/**: External system adapters (Thunderbird API, Web APIs)
- **background/**: Thunderbird background script integration
- **options/**: Options page UI integration
- **types/**: TypeScript types for interface layer

**Dependencies**: Application layer, Infrastructure layer

### Shared Layer

**Purpose**: Cross-cutting concerns shared across all layers.

- **constants/**: Application-wide constants
- **types/**: Shared type definitions
- **utils/**: Utility functions and helpers

**Dependencies**: None (pure utilities)

---

## Interfaces

### IProvider

Defines the contract for AI providers that analyze emails and assign tags.

```typescript
interface IProvider {
  providerId: string;                                      // Unique identifier
  validateSettings(settings: IProviderSettings): Promise<boolean>;
  analyze(input: IAnalyzeInput): Promise<ITagResponse>;
}
```

**Usage**: Core interface for all AI provider implementations (OpenAI, Claude, Ollama, etc.)

### ICache

Generic cache interface for storing and retrieving typed data with TTL support.

```typescript
interface ICache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  cleanupExpired(): Promise<number>;
  getStats(): Promise<ICacheStats>;
}
```

**Usage**: Caching analysis results, configuration data, API responses

### IQueue

Priority-based queue interface for async task processing.

```typescript
interface IQueue {
  enqueue<T>(item: T, priority?: number): Promise<void>;
  dequeue<T>(): Promise<T | null>;
  peek<T>(): Promise<T | null>;
  size(): Promise<number>;
  isEmpty(): Promise<boolean>;
  clear(cancelRunning?: boolean): Promise<number>;
  getStats(): Promise<IQueueStats>;
}
```

**Usage**: Email processing queue, rate limiting, job scheduling

### ILogger

Logging interface with multiple severity levels and API key masking.

```typescript
interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  maskApiKey(key?: string): string;
}
```

**Usage**: Centralized logging throughout the application

---

## Dependency Injection

The project uses **TSyringe** for runtime dependency injection with TypeScript decorators.

### Setup

```typescript
import 'reflect-metadata';
import { container, inject, injectable, singleton } from 'tsyringe';

// Register implementations
container.register<ILogger>('ILogger', { useClass: ConsoleLogger });
container.register<ICache>('ICache', { useClass: MemoryCache });
container.registerSingleton<ILogger>('ILogger', ConsoleLogger);
```

### Usage

```typescript
@injectable()
class EmailAnalysisService {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IProvider') private readonly provider: IProvider,
    @inject('ICache') private readonly cache: ICache
  ) {}

  async analyzeEmail(data: IStructuredEmailData): Promise<ITagResponse> {
    this.logger.debug('Starting email analysis');
    return await this.provider.analyze({ settings, data, tags });
  }
}

// Resolve from container
const service = container.resolve(EmailAnalysisService);
```

### Provider Factory Registration

```typescript
import { ProviderFactory } from './infrastructure/providers/ProviderFactory';

// Register provider factory
container.register<ProviderFactory>('ProviderFactory', {
  useClass: ProviderFactory
});

// Resolve and create providers
const factory = container.resolve<ProviderFactory>('ProviderFactory');
const openaiProvider = factory.createProvider('openai', settings);
```

---

## Provider Architecture

### Core Components

```
┌─────────────────────────────────────────────┐
│          ProviderFactory                     │
│  Creates provider instances by ID           │
└─────────────────────────────────────────────┘
                    │
                    ├─→ OpenAIProvider
                    ├─→ ClaudeProvider
                    ├─→ OllamaProvider
                    ├─→ GeminiProvider
                    └─→ Other Providers
```

### BaseProviderAdapter

Adapter pattern implementation that bridges legacy BaseProvider implementations with the IProvider interface.

```typescript
@injectable()
class BaseProviderAdapter<T extends BaseProvider> implements IProvider {
  constructor(
    providerId: string,
    private readonly provider: T,
    logger: ILogger
  ) {
    this.providerId = providerId;
  }

  async validateSettings(settings: IProviderSettings): Promise<boolean> {
    // Convert IProviderSettings to BaseProviderSettings
    // Delegate to BaseProvider.validateSettings()
  }

  async analyze(input: IAnalyzeInput): Promise<ITagResponse> {
    // Convert IAnalyzeInput to LegacyAnalyzeInput
    // Delegate to BaseProvider.analyze()
    // Convert legacy response to ITagResponse
  }
}
```

**Purpose**: Enables dependency injection for existing BaseProvider implementations without modifying them.

### ProviderFactory

Factory pattern implementation for creating provider instances dynamically.

```typescript
class ProviderFactory {
  createProvider(providerId: string, settings: IProviderSettings): IProvider {
    switch (providerId) {
      case 'openai':
        return new BaseProviderAdapter('openai', new OpenAIProvider(), logger);
      case 'ollama':
        return new BaseProviderAdapter('ollama', new OllamaProvider(), logger);
      // ... other providers
      default:
        throw new Error(`Unknown provider: ${providerId}`);
    }
  }
}
```

**Purpose**: Centralized provider creation with consistent interface

---

## Migration Status

### Completed

- ✅ Infrastructure interfaces (IProvider, ICache, ILogger, IQueue)
- ✅ BaseProviderAdapter for legacy integration
- ✅ ProviderFactory implementation
- ✅ ConsoleLogger and LegacyLogger implementations
- ✅ MemoryCache implementation
- ✅ Dependency injection setup with TSyringe
- ✅ Application layer structure (dto, ports, services, use-cases)
- ✅ Domain layer structure (entities, events, services, value-objects)
- ✅ Infrastructure layer structure (cache, logger, providers, persistence)
- ✅ Interface layer structure (adapters, background, options)
- ✅ Shared layer structure (constants, types, utils)

### In Progress

- 🔄 Migration of background.ts to hexagonal architecture
- 🔄 Migration of options.ts to hexagonal architecture
- 🔄 Repository implementations for configuration storage

### TODO

- ⬜ Domain entities (Email, Tag, Provider)
- ⬜ Use case implementations (AnalyzeEmail, ApplyTags)
- ⬜ Application services orchestration
- ⬜ Thunderbird API adapters
- ⬜ Configuration persistence
- ⬜ Email parsing service
- ⬜ Tag application service
- ⬜ Rate limiter integration
- ⬜ Event-driven architecture with domain events

---

## Code Examples

### Example 1: Injecting and Using Services

```typescript
import { injectable, inject } from 'tsyringe';
import type { ILogger, IProvider, ICache } from '../infrastructure/interfaces';

@injectable()
class EmailAnalysisUseCase {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IProvider') private readonly provider: IProvider,
    @inject('ICache') private readonly cache: ICache
  ) {}

  async execute(data: IStructuredEmailData): Promise<ITagResponse> {
    // Check cache first
    const cacheKey = this.generateCacheKey(data);
    const cached = await this.cache.get<ITagResponse>(cacheKey);

    if (cached) {
      this.logger.info('Cache hit for email analysis');
      return cached;
    }

    // Analyze with provider
    this.logger.debug('Analyzing email with provider');
    const result = await this.provider.analyze({ settings, data, tags });

    // Cache result
    await this.cache.set(cacheKey, result, 3600000); // 1 hour TTL

    return result;
  }

  private generateCacheKey(data: IStructuredEmailData): string {
    return `email:${hash(JSON.stringify(data))}`;
  }
}
```

### Example 2: Creating and Using a Provider

```typescript
import { container } from 'tsyringe';
import { ProviderFactory } from './infrastructure/providers/ProviderFactory';

// Register provider factory
container.register<ProviderFactory>('ProviderFactory', {
  useClass: ProviderFactory
});

// Use the provider factory
const factory = container.resolve<ProviderFactory>('ProviderFactory');
const provider = factory.createProvider('openai', {
  apiKey: 'sk-...',
  model: 'gpt-4'
});

// Analyze email
const result = await provider.analyze({
  settings: { apiKey: 'sk-...', model: 'gpt-4' },
  data: { headers: {}, body: 'Hello...', attachments: [] },
  tags: [{ key: 'is_advertise', name: 'Ad', description: '...' }]
});
```

### Example 3: Using the Queue for Email Processing

```typescript
import { injectable, inject } from 'tsyringe';
import type { ILogger, IQueue } from '../infrastructure/interfaces';

interface EmailProcessingJob {
  emailId: string;
  data: IStructuredEmailData;
}

@injectable()
class EmailProcessingService {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IQueue') private readonly queue: IQueue
  ) {}

  async processEmail(emailId: string, data: IStructuredEmailData): Promise<void> {
    const job: EmailProcessingJob = { emailId, data };

    // Enqueue with high priority
    await this.queue.enqueue(job, 10);
    this.logger.info('Email queued for processing', { emailId });
  }

  async startProcessing(): Promise<void> {
    while (!await this.queue.isEmpty()) {
      const job = await this.queue.dequeue<EmailProcessingJob>();

      if (job) {
        await this.process(job);
      }
    }
  }

  private async process(job: EmailProcessingJob): Promise<void> {
    this.logger.info('Processing email', { emailId: job.emailId });
    // Analysis logic here
  }
}
```

### Example 4: Using Logger with Context

```typescript
import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../infrastructure/interfaces';

@injectable()
class SomeService {
  constructor(
    @inject('ILogger') private readonly logger: ILogger
  ) {}

  doSomething(apiKey?: string): void {
    this.logger.info('Starting operation', {
      timestamp: Date.now(),
      operation: 'some_operation'
    });

    try {
      // Log API key safely
      this.logger.debug('Using API key', {
        maskedKey: this.logger.maskApiKey(apiKey)
      });

      // ... do something

      this.logger.info('Operation completed successfully');
    } catch (error) {
      this.logger.error('Operation failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
}
```

---

## Testing Strategy

### Unit Tests

Test individual components in isolation using mocked dependencies:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { container } from 'tsyringe';

describe('EmailAnalysisUseCase', () => {
  it('should return cached result', async () => {
    // Mock dependencies
    const mockLogger = { debug: vi.fn(), info: vi.fn() };
    const mockCache = { get: vi.fn().mockResolvedValue(cachedResult) };
    const mockProvider = { analyze: vi.fn() };

    // Register mocks
    container.registerInstance('ILogger', mockLogger);
    container.registerInstance('ICache', mockCache);
    container.registerInstance('IProvider', mockProvider);

    // Test
    const useCase = container.resolve(EmailAnalysisUseCase);
    const result = await useCase.execute(data);

    expect(result).toEqual(cachedResult);
    expect(mockProvider.analyze).not.toHaveBeenCalled();
  });
});
```

### Integration Tests

Test interactions between components:

```typescript
import { describe, it, expect } from 'vitest';
import { ProviderFactory } from '../infrastructure/providers/ProviderFactory';

describe('Provider Integration', () => {
  it('should analyze email with real provider', async () => {
    const factory = new ProviderFactory();
    const provider = factory.createProvider('ollama', {
      apiUrl: 'http://localhost:11434',
      model: 'llama2'
    });

    const result = await provider.analyze({
      settings: { apiUrl: 'http://localhost:11434', model: 'llama2' },
      data: { headers: {}, body: 'Hello World', attachments: [] },
      tags: [{ key: 'test', name: 'Test', description: '...' }]
    });

    expect(result.tags).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });
});
```

---

## Development Guidelines

1. **Always use interfaces** for dependencies (not concrete implementations)
2. **Add @injectable() decorator** to classes that need DI
3. **Use @inject() decorator** for constructor parameters
4. **Follow SOLID principles** - single responsibility, open/closed, etc.
5. **Keep domain layer pure** - no external dependencies
6. **Use type guards** for runtime type checking with `unknown` types
7. **Log extensively** with context for debugging
8. **Mask sensitive data** in logs (API keys, tokens)
9. **Write tests** for all use cases and services
10. **Update this document** when architecture changes

---

## Resources

- [Hexagonal Architecture (Ports and Adapters)](https://alistair.cockburn.us/hexagonal-architecture/)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [TSyringe Documentation](https://github.com/microsoft/tsyringe)
- [Dependency Injection in TypeScript](https://dev.to/mguinea/di-in-typescript-3hej)
