# ADR-0005: Value Objects with Validation

## Status

Accepted

## Context

The Thunderbird Email AI Assistant handles sensitive data and user inputs:

1. **API keys**: Must be validated, masked in logs, never exposed
2. **Email addresses**: Need format validation and normalization
3. **Tag keys**: Must follow Thunderbird naming conventions
4. **Tag colors**: Need hex format validation and contrast utilities
5. **Email content**: Subject and body with length limits and sanitization

Without proper value objects, we face:
- **Invalid data propagation**: Bad data flows through the system
- **Security risks**: API keys logged in plaintext
- **Inconsistent behavior**: Different validation logic in different places
- **Type confusion**: String primitives mixed up (email vs subject vs tag)

## Decision

We implement **Value Objects** with **built-in validation** for all domain values.

### Value Object Pattern

Value Objects are:
- **Immutable**: Cannot be changed after creation
- **Validated**: Constructor validates and throws on invalid input
- **Self-contained**: All related logic is encapsulated
- **Type-safe**: TypeScript distinguishes between different value types

### Value Objects in the Project

| Value Object | Purpose | Location |
|-------------|---------|----------|
| `ApiKey` | Validated API key with masking | `src/domain/value-objects/ApiKey.ts` |
| `EmailAddress` | Validated email address | `src/domain/value-objects/EmailAddress.ts` |
| `EmailSubject` | Subject with length limits | `src/domain/value-objects/EmailSubject.ts` |
| `EmailBody` | HTML/text body handling | `src/domain/value-objects/EmailBody.ts` |
| `TagKey` | Thunderbird-compatible tag key | `src/domain/value-objects/TagKey.ts` |
| `TagColor` | Hex color with contrast | `src/domain/value-objects/TagColor.ts` |

### Example: ApiKey Value Object

```typescript
export class ApiKey {
  readonly value: string;
  readonly provider?: string;
  
  private static readonly MIN_LENGTH = 8;
  private static readonly MAX_LENGTH = 256;

  constructor(value: string, provider?: string) {
    const trimmed = value.trim();
    
    // Validation
    if (!trimmed) throw new InvalidApiKeyError('API key cannot be empty');
    if (trimmed.length < ApiKey.MIN_LENGTH) throw new InvalidApiKeyError('Too short');
    if (trimmed.length > ApiKey.MAX_LENGTH) throw new InvalidApiKeyError('Too long');
    if (/[\s\x00-\x1F\x7F]/.test(trimmed)) throw new InvalidApiKeyError('Invalid chars');
    
    this.value = trimmed;
    this.provider = provider;
  }

  // Safe masking for logging
  get masked(): string {
    return this.value.slice(0, 4) + '***' + this.value.slice(-4);
  }

  // NEVER expose full key
  toString(): string { return this.masked; }
  toJSON(): string { return this.masked; }

  // Type detection helpers
  isOpenAI(): boolean { return this.value.startsWith('sk-'); }
  isClaude(): boolean { return this.value.startsWith('sk-ant-'); }
  isGemini(): boolean { return this.value.startsWith('AIza'); }

  // Equality
  equals(other: ApiKey): boolean { return this.value === other.value; }

  // Safe factory methods
  static isValid(key: string): boolean { /* ... */ }
  static tryCreate(key: string): ApiKey | null { /* ... */ }
}
```

### Validation Errors

Custom error types provide context:

```typescript
// src/domain/errors/ValueObjectErrors.ts
export class ValueObjectError extends Error {
  constructor(message: string, public readonly valueObject: string) {
    super(`[${valueObject}] ${message}`);
  }
}

export class InvalidApiKeyError extends ValueObjectError {
  constructor(message: string, provider?: string) {
    super(message, 'ApiKey');
  }
}
```

### Alternatives Considered

| Alternative | Pros | Cons | Decision |
|------------|------|------|----------|
| **Plain Primitives** | Simple | No validation, no type safety | Rejected |
| **Runtime Validation Only** | Catches errors late | Scattered validation logic | Rejected |
| **Zod/io-ts Schemas** | Powerful validation | External dependency, less OOP | Rejected |
| **Class-based Value Objects** | Full control, type-safe | More boilerplate | **Accepted** |

## Consequences

### Positive

- **Type safety**: TypeScript distinguishes `ApiKey` from `EmailAddress`
- **Validation at construction**: Invalid data cannot exist in the system
- **Security**: API keys are never logged in full
- **Encapsulation**: All related logic is in one place
- **Immutability**: Thread-safe, predictable behavior
- **Self-documenting**: Value Object names clearly express intent
- **Reusable utilities**: Methods like `mask()`, `getDomain()`, etc.

### Negative

- **More code**: Each value type requires a class
- **Performance**: Object allocation for primitive values
- **Serialization**: Need custom `toJSON()` for API keys
- **Learning curve**: Developers need to use value objects consistently

### Mitigations

- **Factory methods**: `tryCreate()` returns null instead of throwing
- **Clear errors**: Custom error types with context
- **Barrel exports**: Easy imports via `src/domain/value-objects/index.ts`
- **Documentation**: AGENTS.md explains patterns and usage

## References

### Key Files

- `src/domain/value-objects/ApiKey.ts` - API key with masking
- `src/domain/value-objects/EmailAddress.ts` - Email validation
- `src/domain/value-objects/EmailSubject.ts` - Subject handling
- `src/domain/value-objects/EmailBody.ts` - Body handling
- `src/domain/value-objects/TagKey.ts` - Tag key validation
- `src/domain/value-objects/TagColor.ts` - Color utilities
- `src/domain/value-objects/index.ts` - Barrel export
- `src/domain/errors/ValueObjectErrors.ts` - Custom error types

### Related ADRs

- [ADR-0002: Hexagonal Architecture](0002-hexagonal-architecture-with-di.md)
- [ADR-0003: Multi-Provider Strategy](0003-multi-provider-strategy.md)

### External References

- [Martin Fowler - Value Object](https://martinfowler.com/bliki/ValueObject.html)
- [Domain-Driven Design - Value Objects](https://www.domainlanguage.com/ddd/)
- [TypeScript Brand Types](https://egghead.io/blog/using-brand-types-in-typescript)
