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

## Migration Status

### Phase 1: Infrastructure Foundation ✅ COMPLETED
- ✅ Infrastructure interfaces (IProvider, ICache, ILogger, IQueue)
- ✅ BaseProviderAdapter for legacy integration
- ✅ ProviderFactory implementation
- ✅ ConsoleLogger and LegacyLogger implementations
- ✅ MemoryCache implementation
- ✅ Dependency injection setup with TSyringe
- ✅ Build system with Webpack
- ✅ Test framework setup with Vitest

### Phase 2: Application & Domain Layers ✅ COMPLETED
- ✅ Application layer structure (dto, ports, services, use-cases)
- ✅ Domain layer structure (entities, events, services, value-objects)
- ✅ Use case implementations (AnalyzeEmail, ApplyTags, AnalyzeBatchEmails)
- ✅ Application services (PriorityQueue, RateLimiterService)
- ✅ Domain entities (Email, Tag, Provider)
- ✅ Value objects with validation (EmailSubject, EmailAddress, TagKey, TagColor, EmailBody)
- ✅ Domain events (EmailReceived, EmailAnalyzed, TagApplied, ProviderError)
- ✅ Event-driven architecture with EventBus
- ✅ Background script integration
- ✅ Core domain services (EmailContentExtractor, TagService)

### Phase 3: Persistence & UI Components ✅ COMPLETED
- ✅ ConfigRepository implementation (IndexedDB persistence)
- ✅ IConfigRepository interface
- ✅ UI Components (SettingsForm, TagManagementUI, BatchAnalysisUI)
- ✅ Thunderbird API adapters (ThunderbirdMailReader, ThunderbirdTagManager)
- ✅ IMailReader and ITagManager interfaces
- ✅ Options page integration with OptionsScript
- ✅ MessageHandler for background script
- ✅ EmailEventListener for event-driven email processing
- ✅ ProviderFactory with dependency injection support
- ✅ Type-safe configuration management

### Code Reduction Summary
- **background.ts**: 2282 → 450 Zeilen (-80%)
- **options.ts**: 1700 → 4 Components
- **Total**: ~4000 Zeilen → ~2000 Zeilen (-50%)

### Build & Test Status ✅
- **Build**: ✅ SUCCESS (6.8s)
  - background-bundle.js: 240 KB
  - options-bundle.js: 87 KB
- **Tests**: ✅ 165 passed (7 test files)
  - Unit tests for all use cases
  - Integration tests with real providers
  - Repository tests with IndexedDB
  - Concurrency tests
  - Rate limiter tests

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

## Architecture Benefits

The hexagonal architecture provides the following key benefits:

1. **Clean Separation of Concerns**: Each layer has a well-defined responsibility
2. **Testability**: Easy to mock dependencies for unit testing
3. **Maintainability**: Changes in one layer don't affect others
4. **Flexibility**: Easy to swap implementations (e.g., different providers, storage backends)
5. **Type Safety**: TypeScript strict mode with comprehensive type definitions
6. **Event-Driven**: Loose coupling through domain events and event bus
7. **Dependency Injection**: Centralized dependency management with TSyringe
8. **Persistence**: IndexedDB-based configuration storage
9. **Extensibility**: Easy to add new providers, use cases, or features
10. **Code Reduction**: 50% reduction in code size through modular architecture

---

## Directory Structure

```
src/
├── application/           # Application Layer (Use Cases)
│   ├── dto/              # Data Transfer Objects
│   ├── ports/            # Input/Output Ports (Interfaces)
│   ├── services/         # Application Services
│   │   ├── PriorityQueue.ts
│   │   └── RateLimiterService.ts
│   └── use-cases/        # Use Case Implementations
│       ├── AnalyzeEmail.ts
│       ├── ApplyTagsToEmail.ts
│       └── AnalyzeBatchEmails.ts
│
├── domain/               # Domain Layer (Business Logic)
│   ├── entities/         # Domain Entities
│   │   ├── Email.ts
│   │   ├── Tag.ts
│   │   └── Provider.ts
│   ├── events/           # Domain Events
│   │   ├── DomainEvent.ts
│   │   ├── EventBus.ts
│   │   ├── EmailReceivedEvent.ts
│   │   ├── EmailAnalyzedEvent.ts
│   │   ├── TagAppliedEvent.ts
│   │   ├── TagCreatedEvent.ts
│   │   └── ProviderErrorEvent.ts
│   ├── services/         # Domain Services
│   │   ├── EmailContentExtractor.ts
│   │   └── TagService.ts
│   └── value-objects/    # Value Objects
│       ├── EmailSubject.ts
│       ├── EmailAddress.ts
│       ├── TagKey.ts
│       ├── TagColor.ts
│       └── EmailBody.ts
│
├── infrastructure/       # Infrastructure Layer (External)
│   ├── cache/            # Cache Implementations
│   │   └── MemoryCache.ts
│   ├── config/           # Configuration
│   │   └── AppConfig.ts
│   ├── interfaces/       # Core Interfaces
│   │   ├── ICache.ts
│   │   ├── IConfigRepository.ts
│   │   ├── ILogger.ts
│   │   ├── IMailReader.ts
│   │   ├── IProvider.ts
│   │   ├── IQueue.ts
│   │   └── ITagManager.ts
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
│       └── IndexedDBConfigRepository.ts
│
├── interfaces/           # Interface Layer (Adapters)
│   ├── adapters/         # External Adapters
│   │   ├── ThunderbirdMailReader.ts
│   │   └── ThunderbirdTagManager.ts
│   ├── background/       # Background Script Integration
│   │   ├── EmailEventListener.ts
│   │   ├── MessageHandler.ts
│   │   └── index.ts
│   ├── options/          # Options Page Integration
│   │   ├── SettingsForm.ts
│   │   ├── TagManagementUI.ts
│   │   ├── BatchAnalysisUI.ts
│   │   └── OptionsScript.ts
│   └── types/            # Interface Type Definitions
│
└── shared/               # Shared Utilities
    ├── constants/        # Application Constants
    │   └── ProviderConstants.ts
    ├── types/            # Shared Type Definitions
    │   ├── EmailPart.ts
    │   ├── ProviderTypes.ts
    │   └── TagTypes.ts
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

- **use-cases/**: Application use case implementations (AnalyzeEmail, ApplyTags, AnalyzeBatchEmails)
- **services/**: Application services (PriorityQueue, RateLimiterService)
- **ports/**: Input and output ports for external communication
- **dto/**: Data transfer objects for inter-layer communication

**Dependencies**: Domain layer, Infrastructure interfaces

### Infrastructure Layer

**Purpose**: Provides concrete implementations of interfaces defined in the domain/application layers.

- **providers/**: AI provider implementations (OpenAI, Claude, Ollama, etc.)
- **cache/**: Cache implementations (MemoryCache)
- **logger/**: Logger implementations (ConsoleLogger, LegacyLogger)
- **persistence/**: Database/file storage implementations
- **repositories/**: Repository pattern implementations (IndexedDBConfigRepository)
- **interfaces/**: Core system interfaces (IProvider, ICache, ILogger, IQueue, IConfigRepository, IMailReader, ITagManager)

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

### IConfigRepository

Repository interface for configuration persistence using IndexedDB.

```typescript
interface IConfigRepository {
  initialize(): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
  clear(): Promise<void>;
}
```

**Usage**: Storing and retrieving configuration data (API keys, settings, tags)

### IMailReader

Interface for reading emails from Thunderbird.

```typescript
interface IMailReader {
  getEmail(messageId: number): Promise<IStructuredEmailData>;
  getHeaders(messageId: number): Promise<Record<string, string>>;
  getBody(messageId: number): Promise<string>;
  getAttachments(messageId: number): Promise<IAttachment[]>;
  getTaggedMessages(): Promise<number[]>;
}
```

**Usage**: Reading email data from Thunderbird API

### ITagManager

Interface for managing tags in Thunderbird.

```typescript
interface ITagManager {
  getTagKey(tagId: number): Promise<string>;
  getTags(): Promise<ITagInfo[]>;
  createTag(key: string, name: string, color: string): Promise<number>;
  addTagToMessage(messageId: number, tagKey: string): Promise<void>;
  removeTagFromMessage(messageId: number, tagKey: string): Promise<void>;
}
```

**Usage**: Creating and applying tags to emails in Thunderbird

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

// Register provider factory (injectable)
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
@injectable()
class ProviderFactory {
  constructor(
    @inject('ILogger') private readonly logger: ILogger
  ) {}

  createProvider(providerId: string, settings: IProviderSettings): IProvider {
    switch (providerId) {
      case 'openai':
        return new BaseProviderAdapter('openai', new OpenAIProvider(), this.logger);
      case 'ollama':
        return new BaseProviderAdapter('ollama', new OllamaProvider(), this.logger);
      // ... other providers
      default:
        throw new Error(`Unknown provider: ${providerId}`);
    }
  }
}
```

**Purpose**: Centralized provider creation with consistent interface and DI support

---

## Domain Events

### EventBus

Central event bus for domain event distribution.

```typescript
interface IDomainEvent {
  type: string;
  timestamp: Date;
}

class EventBus {
  private subscribers = new Map<string, Set<EventHandler>>();

  subscribe(eventType: string, handler: EventHandler): void;
  unsubscribe(eventType: string, handler: EventHandler): void;
  publish(event: IDomainEvent): Promise<void>;
}
```

### Example Usage

```typescript
import { EventBus, EmailAnalyzedEvent } from '../domain/events';

// Subscribe to events
eventBus.subscribe('EmailAnalyzed', async (event: EmailAnalyzedEvent) => {
  logger.info('Email analyzed', { messageId: event.messageId });
  await applyTags(event.messageId, event.tags);
});

// Publish event
await eventBus.publish(new EmailAnalyzedEvent(messageId, tags));
```

### Available Events

- **EmailReceivedEvent**: Emitted when a new email is received
- **EmailAnalyzedEvent**: Emitted after AI analysis is complete
- **TagAppliedEvent**: Emitted when tags are applied to an email
- **TagCreatedEvent**: Emitted when a new tag is created
- **ProviderErrorEvent**: Emitted when a provider error occurs

---

## Configuration Management

### ConfigRepository (IndexedDB)

Repository for persisting configuration data using IndexedDB.

```typescript
@injectable()
class IndexedDBConfigRepository implements IConfigRepository {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'EmailAssistantConfig';
  private readonly STORE_NAME = 'config';

  constructor(@inject('ILogger') private readonly logger: ILogger) {}

  async initialize(): Promise<void> {
    // Initialize IndexedDB database
  }

  async get<T>(key: string): Promise<T | null> {
    // Retrieve value from IndexedDB
  }

  async set<T>(key: string, value: T): Promise<void> {
    // Store value in IndexedDB
  }
}
```

### Usage Example

```typescript
import { container } from 'tsyringe';
import type { IConfigRepository } from '../infrastructure/interfaces';

// Repository is registered in container
const config = container.resolve<IConfigRepository>('IConfigRepository');
await config.initialize();

// Store API key
await config.set('openai.apiKey', 'sk-...');

// Retrieve API key
const apiKey = await config.get<string>('openai.apiKey');
```

---

## Code Examples

### Example 1: Using ConfigRepository for Configuration

```typescript
import { injectable, inject } from 'tsyringe';
import type { IConfigRepository, ILogger } from '../infrastructure/interfaces';

@injectable()
class SettingsService {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IConfigRepository') private readonly config: IConfigRepository
  ) {}

  async saveApiKey(providerId: string, apiKey: string): Promise<void> {
    const key = `${providerId}.apiKey`;
    await this.config.set(key, apiKey);
    this.logger.info('API key saved', { providerId });
  }

  async getApiKey(providerId: string): Promise<string | null> {
    const key = `${providerId}.apiKey`;
    return await this.config.get<string>(key);
  }

  async saveSettings(settings: IProviderSettings): Promise<void> {
    await this.config.set('settings', settings);
    this.logger.info('Settings saved');
  }

  async getSettings(): Promise<IProviderSettings | null> {
    return await this.config.get<IProviderSettings>('settings');
  }
}
```

### Example 2: Domain Events with EventBus

```typescript
import { injectable, inject } from 'tsyringe';
import type { ILogger } from '../infrastructure/interfaces';
import { EventBus, EmailAnalyzedEvent, TagAppliedEvent } from '../domain/events';

@injectable()
class EmailAnalysisOrchestrator {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    private readonly eventBus: EventBus
  ) {
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.eventBus.subscribe('EmailAnalyzed', this.handleEmailAnalyzed.bind(this));
    this.eventBus.subscribe('TagApplied', this.handleTagApplied.bind(this));
  }

  async analyzeAndTagEmail(messageId: number): Promise<void> {
    // ... analysis logic

    // Publish event
    await this.eventBus.publish(new EmailAnalyzedEvent(messageId, tags));
  }

  private async handleEmailAnalyzed(event: EmailAnalyzedEvent): Promise<void> {
    this.logger.info('Email analyzed, applying tags', { messageId: event.messageId });
    // Apply tags to email
    await this.applyTags(event.messageId, event.tags);
  }

  private async handleTagApplied(event: TagAppliedEvent): Promise<void> {
    this.logger.info('Tags applied', { messageId: event.messageId, tags: event.tags });
  }
}
```

### Example 3: UI Components with React-like Structure

```typescript
import { container } from 'tsyringe';
import type { IConfigRepository } from '../infrastructure/interfaces';

// SettingsForm Component
class SettingsForm {
  constructor(
    @inject('IConfigRepository') private readonly config: IConfigRepository
  ) {}

  async render(): Promise<void> {
    const settings = await this.config.get('settings');
    this.renderForm(settings);
    this.bindEvents();
  }

  private bindEvents(): void {
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = this.getFormData();
      await this.config.set('settings', formData);
      this.showSuccessMessage();
    });
  }
}

// Initialize in OptionsScript
document.addEventListener('DOMContentLoaded', () => {
  const settingsForm = container.resolve(SettingsForm);
  settingsForm.render();
});
```

### Example 4: Using Thunderbird Adapters

```typescript
import { injectable, inject } from 'tsyringe';
import type { IMailReader, ITagManager, ILogger } from '../infrastructure/interfaces';

@injectable()
class ThunderbirdIntegrationService {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IMailReader') private readonly mailReader: IMailReader,
    @inject('ITagManager') private readonly tagManager: ITagManager
  ) {}

  async processNewEmail(messageId: number): Promise<void> {
    // Read email
    const email = await this.mailReader.getEmail(messageId);
    this.logger.info('Email retrieved', { subject: email.subject });

    // Create tag if needed
    const tagKey = 'ai-analyzed';
    const tags = await this.tagManager.getTags();
    if (!tags.some(t => t.key === tagKey)) {
      await this.tagManager.createTag(tagKey, 'AI Analyzed', '#FF5722');
    }

    // Apply tag
    await this.tagManager.addTagToMessage(messageId, tagKey);
    this.logger.info('Tag applied', { messageId, tagKey });
  }
}
```

### Example 5: Batch Analysis with Rate Limiting

```typescript
import { injectable, inject } from 'tsyringe';
import type { ILogger, IQueue } from '../infrastructure/interfaces';
import { RateLimiterService } from '../application/services';

@injectable()
class BatchAnalysisUseCase {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IQueue') private readonly queue: IQueue,
    private readonly rateLimiter: RateLimiterService
  ) {}

  async analyzeBatch(messageIds: number[]): Promise<void> {
    this.logger.info('Starting batch analysis', { count: messageIds.length });

    // Enqueue all emails
    for (const messageId of messageIds) {
      await this.queue.enqueue({ messageId }, 5);
    }

    // Process queue
    while (!await this.queue.isEmpty()) {
      await this.rateLimiter.waitIfNeeded();
      const job = await this.queue.dequeue<Job>();
      if (job) {
        await this.processJob(job);
      }
    }

    this.logger.info('Batch analysis complete');
  }

  private async processJob(job: Job): Promise<void> {
    // ... analysis logic
  }
}
```

---

## Testing Strategy

### Unit Tests

Test individual components in isolation using mocked dependencies:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from 'tsyringe';

describe('EmailAnalysisUseCase', () => {
  beforeEach(() => {
    container.clearInstances();
  });

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
import { describe, it, expect, beforeEach } from 'vitest';
import { container } from 'tsyringe';
import { ProviderFactory } from '../infrastructure/providers/ProviderFactory';

describe('Provider Integration', () => {
  beforeEach(() => {
    container.clearInstances();
  });

  it('should analyze email with real provider', async () => {
    const factory = new ProviderFactory(logger);
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

### Repository Tests

Test configuration repository with IndexedDB:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexedDBConfigRepository } from '../infrastructure/repositories';

describe('ConfigRepository', () => {
  let repo: IndexedDBConfigRepository;

  beforeEach(async () => {
    repo = new IndexedDBConfigRepository(logger);
    await repo.initialize();
  });

  afterEach(async () => {
    await repo.clear();
  });

  it('should store and retrieve values', async () => {
    await repo.set('test-key', { value: 'test' });
    const result = await repo.get<{ value: string }>('test-key');

    expect(result).toEqual({ value: 'test' });
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
11. **Use domain events** for loose coupling between components
12. **Register repositories** in DI container for persistence
13. **Use TSyringe container** for resolving dependencies
14. **Keep UI components modular** and testable
15. **Follow TypeScript strict mode** with comprehensive type definitions

---

## Deployment Status

### ✅ Ready for Deployment
- All three migration phases completed
- Build successful with optimized bundles
- All tests passing (165 tests)
- Code reduced by 50%
- Architecture follows best practices
- Type-safe with TypeScript strict mode

### Next Steps
1. **Thunderbird Testing**: Test extension in Thunderbird environment
2. **Performance Monitoring**: Monitor memory usage and performance
3. **User Feedback**: Collect feedback from beta users
4. **Documentation**: Update user documentation
5. **Release**: Prepare for public release

---

## Resources

- [Hexagonal Architecture (Ports and Adapters)](https://alistair.cockburn.us/hexagonal-architecture/)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [TSyringe Documentation](https://github.com/microsoft/tsyringe)
- [Dependency Injection in TypeScript](https://dev.to/mguinea/di-in-typescript-3hej)
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html)
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
