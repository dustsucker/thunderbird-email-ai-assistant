# Agent Guidelines for Thunderbird Email AI Assistant

## Project Overview

Thunderbird MailExtension for AI-powered email classification and tagging using multiple LLM providers (OpenAI, Gemini, Claude, Mistral, DeepSeek, Ollama, ZAI).

Architecture: **Hexagonal/Clean Architecture** with Dependency Injection (TSyringe).

---

## Commands

### Testing

```bash
npm test                      # Run all tests
npx vitest run                # Run all tests (alternative)
npx vitest run <test-file>    # Run single test file
npx vitest run test/analyze-email.test.ts  # Example: single test
npm run test:watch            # Watch mode
npm run test:coverage         # With coverage report
```

### Build & Type Check

```bash
npm run build                 # Production build (webpack)
npm run build:dev             # Development build
npm run type-check            # TypeScript check without emit
```

### Lint & Format

```bash
npm run lint                  # Check for issues
npm run lint:fix              # Auto-fix issues
npm run format                # Format with Prettier
```

### Packaging

```bash
npm run clean                 # Remove dist/ and bundles
npm run package               # Create .xpi for Thunderbird
```

---

## Project Structure

```
thunderbird-email-ai-assistant/
├── src/
│   ├── domain/           # Core business logic (no dependencies)
│   ├── application/      # Use cases and orchestration
│   ├── infrastructure/   # External services (providers, storage)
│   ├── interfaces/       # UI adapters, Thunderbird integration
│   └── shared/           # Types, utils, constants
├── core/                 # Legacy standalone module
├── test/                 # Test files (vitest)
├── background.ts         # Extension background script (entry)
├── options.ts            # Options page script (entry)
└── manifest.json         # Thunderbird extension manifest
```

**See AGENTS.md files in each subdirectory for detailed rules:**

- [src/domain/AGENTS.md](src/domain/AGENTS.md) - Entities, Value Objects, Events
- [src/application/AGENTS.md](src/application/AGENTS.md) - Use Cases, Services
- [src/infrastructure/AGENTS.md](src/infrastructure/AGENTS.md) - Providers, Interfaces, Repositories
- [src/interfaces/AGENTS.md](src/interfaces/AGENTS.md) - Adapters, UI Components
- [src/shared/AGENTS.md](src/shared/AGENTS.md) - Types, Utils, Constants
- [core/AGENTS.md](core/AGENTS.md) - Legacy module
- [test/AGENTS.md](test/AGENTS.md) - Testing patterns

---

## Code Style

### TypeScript

- **Strict mode** enabled with comprehensive type definitions
- **JSDoc comments** for public APIs
- **Avoid `any`** - use `unknown` with type guards

### Prettier (.prettierrc)

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

### ESLint Rules

- `@typescript-eslint/no-unused-vars`: error (prefix with `_` to ignore)
- `@typescript-eslint/no-explicit-any`: warn
- `no-console`: warn

### Import Order

```typescript
// 1. External libraries
import { injectable, inject } from 'tsyringe';

// 2. Internal modules (use @/ alias)
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import { Email } from '@/domain/entities/Email';
```

---

## Dependency Injection (TSyringe)

### Registering Services

```typescript
import { container } from 'tsyringe';

container.register<ILogger>('ILogger', { useClass: ConsoleLogger });
container.registerSingleton<ICache>('ICache', MemoryCache);
```

### Injectable Classes

```typescript
@injectable()
export class AnalyzeEmail {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IMailReader') private readonly mailReader: IMailReader
  ) {}
}
```

### Resolving

```typescript
const useCase = container.resolve<AnalyzeEmail>(AnalyzeEmail);
```

---

## Key Patterns

### Type Guards

```typescript
function isThunderbirdTag(value: unknown): value is ThunderbirdTag {
  if (typeof value !== 'object' || value === null) return false;
  const tag = value as Partial<ThunderbirdTag>;
  return typeof tag.key === 'string' && typeof tag.tag === 'string';
}
```

### Error Handling

```typescript
try {
  await this.provider.analyze(input);
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  this.logger.error('Analysis failed', { messageId, error: errorMessage });
  throw new Error(`Failed to analyze: ${errorMessage}`);
}
```

### Section Comments

```typescript
// ============================================================================
// PUBLIC METHODS
// ============================================================================

// ============================================================================
// PRIVATE HELPERS
// ============================================================================
```

---

## Available Providers

| Provider         | Provider ID  | Requires          |
| ---------------- | ------------ | ----------------- |
| Ollama           | `ollama`     | `apiUrl`, `model` |
| OpenAI           | `openai`     | `apiKey`, `model` |
| Google Gemini    | `gemini`     | `apiKey`, `model` |
| Anthropic Claude | `claude`     | `apiKey`, `model` |
| Mistral          | `mistral`    | `apiKey`, `model` |
| DeepSeek         | `deepseek`   | `apiKey`, `model` |
| ZAI PaaS         | `zai-paas`   | `apiKey`, `model` |
| ZAI Coding       | `zai-coding` | `apiKey`, `model` |

---

## Architecture Layers

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

**Dependency Flow:** Interfaces → Application → Domain ← Infrastructure

---

## When Adding New Code

1. **New AI provider?** → `src/infrastructure/providers/impl/`, register in `ProviderFactory`
2. **New business rule?** → `src/domain/entities/` or `src/domain/services/`
3. **New use case?** → `src/application/use-cases/`
4. **New UI component?** → `src/interfaces/options/` or `src/interfaces/shared/components/`
5. **New type/utility?** → `src/shared/types/` or `src/shared/utils/`
6. **Test?** → `test/` with `.test.ts` suffix

---

## Logging

Use ILogger via dependency injection:

```typescript
this.logger.debug('Detailed info', { key: value });
this.logger.info('Important event', { messageId });
this.logger.warn('Recoverable issue', { reason });
this.logger.error('Failure', { error: errorMessage });
```

Always mask API keys: `this.logger.maskApiKey(key)`

---

## Testing

- Framework: **Vitest**
- Mock with `vi.fn()`
- Clear container between tests: `container.clearInstances()`
- Use `test/fixtures/fixture-loader.ts` for test data
