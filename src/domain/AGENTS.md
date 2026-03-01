# Domain Layer - Agent Guidelines

## Purpose

The Domain Layer contains **core business logic** with **no external dependencies**. This is the heart of the application where business rules live, independent of infrastructure concerns.

## Directory Structure

```
src/domain/
├── interfaces/          # Domain interfaces (Dependency Inversion)
│   ├── ILogger.ts      # Logging interface for domain services
│   ├── ITagManager.ts  # Tag management interface
│   └── index.ts        # Barrel export
├── entities/           # Business entities with identity
│   ├── Email.ts       # Email entity with tagging, attachments, flags
│   └── Tag.ts         # Tag entity with validation, Thunderbird conversion
├── value-objects/      # Immutable value objects
│   ├── EmailBody.ts   # Email body with HTML/text handling
│   ├── EmailAddress.ts # Validated email address
│   ├── EmailSubject.ts # Subject line with truncation
│   ├── TagColor.ts    # Hex color with contrast utilities
│   └── TagKey.ts      # Tag key with format validation
├── events/            # Domain events for pub/sub
│   ├── DomainEvent.ts # Base event interface
│   ├── EventBus.ts    # DI-based event bus
│   ├── DomainEventBus.ts # Singleton event bus
│   ├── EmailReceivedEvent.ts
│   ├── EmailAnalyzedEvent.ts
│   ├── TagAppliedEvent.ts
│   ├── TagCreatedEvent.ts
│   └── ProviderErrorEvent.ts
└── services/          # Domain services
    ├── TagService.ts  # Tag management logic
    └── EmailContentExtractor.ts # Email parsing logic
```

## Rules

1. **Pure Domain Logic Only**
   - No infrastructure imports (databases, HTTP clients, external APIs)
   - Business rules and validations only

2. **Dependency Inversion**
   - Domain interfaces (`interfaces/`) define contracts for infrastructure
   - Domain layer imports ONLY from:
     - `@/domain/interfaces/` - Domain interfaces
     - `@/domain/entities/` - Domain entities
     - `@/domain/value-objects/` - Domain value objects
     - `@/domain/services/` - Domain services
     - `@/shared/types/` - Shared type definitions
   - Infrastructure implements domain interfaces (not vice versa)

3. **Entity vs Value Object**
   - **Entities**: Have identity (id), mutable state, equality by ID
   - **Value Objects**: Immutable, equality by value, no identity

4. **Domain Events**
   - Immutable event data classes
   - Event types for: email received, analyzed, tagged

## Patterns

### Entity Pattern

```typescript
// Entity: Has identity, business methods
export class Email {
  readonly id: string; // Identity
  readonly tags: Set<string>; // Mutable state

  constructor(props: EmailProps) {
    if (!props.id) throw new Error('Email ID required');
    this.id = props.id;
    // ...
  }

  applyTag(tagKey: string): void {
    this.tags.add(tagKey.toLowerCase());
  }

  hasTag(tagKey: string): boolean {
    return this.tags.has(tagKey.toLowerCase());
  }
}
```

### Value Object Pattern

```typescript
// Value Object: Immutable, validated
export class EmailAddress {
  readonly value: string;

  constructor(value: string) {
    const trimmed = value.trim();
    this.validate(trimmed);
    this.value = trimmed; // Immutable
  }

  private validate(email: string): void {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) {
      throw new Error(`Invalid email: ${email}`);
    }
  }

  equals(other: EmailAddress): boolean {
    return this.value.toLowerCase() === other.value.toLowerCase();
  }

  getDomain(): string {
    return this.value.split('@')[1];
  }
}
```

### Domain Event Pattern

```typescript
// Event: Immutable, type-safe
export interface EmailAnalyzedEvent extends DomainEvent {
  eventType: 'EmailAnalyzed';
  messageId: string;
  tags: string[];
}

export function createEmailAnalyzedEvent(messageId: string, tags: string[]): EmailAnalyzedEvent {
  return {
    eventType: 'EmailAnalyzed',
    timestamp: new Date().toISOString(),
    messageId,
    tags,
  };
}
```

## When Adding New Domain Code

1. **New interface?** → Add to `interfaces/` for infrastructure to implement
2. **New entity?** → Add to `entities/` with identity field
3. **New value type?** → Add to `value-objects/` with validation
4. **Business event?** → Add to `events/` extending DomainEvent
5. **Cross-entity logic?** → Add domain service to `services/`

## Domain Interfaces

Domain interfaces define the contracts that infrastructure must implement.
They follow the Dependency Inversion Principle - domain defines what it needs,
infrastructure provides the implementation.

### Import Pattern

```typescript
// Correct: Import from domain interfaces
import type { ILogger, ITagManager } from '@/domain/interfaces';

// Wrong: Never import from infrastructure in domain
import type { ILogger } from '@/infrastructure/interfaces/ILogger'; // ❌
```

### Available Interfaces

| Interface     | Purpose             | Implementation          |
| ------------- | ------------------- | ----------------------- |
| `ILogger`     | Logging abstraction | `ConsoleLogger`         |
| `ITagManager` | Tag CRUD operations | `ThunderbirdTagManager` |
