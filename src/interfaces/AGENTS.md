# Interface Layer

This directory contains UI adapters and Thunderbird WebExtension API integration. It serves as the entry point layer connecting the application to Thunderbird and providing user interface components.

## Purpose

- **Adapters**: Bridge between Thunderbird WebExtension API and application interfaces
- **Background**: Service workers handling runtime events and message passing
- **Options**: UI components for the extension's options page
- **Shared**: Reusable UI components and styles

---

## Files

### adapters/

| File                       | Description                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| `ThunderbirdTagManager.ts` | Adapter implementing `ITagManager` for Thunderbird message tags CRUD    |
| `ThunderbirdMailReader.ts` | Adapter implementing `IMailReader` for reading emails via messenger API |
| `index.ts`                 | Barrel export for adapters                                              |

#### Tag-Key Namespace (`_ma_` prefix)

All AI-generated tags live in a reserved Thunderbird tag-key namespace:

- `TAG_KEY_PREFIX = '_ma_'` (defined in `src/shared/constants/TagConstants.ts`) - every AI
  tag's internal Thunderbird key carries this prefix (e.g. `_ma_is_scam`); display names
  get `TAG_NAME_PREFIX = 'A:'`.
- Tag keys **without** the `_ma_` prefix belong to the user (non-AI tags). This namespace
  is reserved: adapters must never create, modify, or delete unprefixed keys.
  `ThunderbirdTagManager` writes only prefixed keys and preserves all other tags on a
  message; `getTagsOnMessage()` returns only `_ma_`-prefixed keys (prefix stripped), so
  unprefixed keys are treated as non-AI by definition.
- Unknown tag keys get the prefix applied as fallback (`_ma_unknown_tag`).

### background/

| File                    | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `MessageHandler.ts`     | Handles runtime messaging between extension components |
| `EmailEventListener.ts` | Listens for new mail events and triggers analysis      |
| `index.ts`              | Barrel export for background services                  |

### options/

| File          | Description                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `DebugTab.ts` | Debug tab for the options page (the only shipped component here; see root `options.html`/`options.ts`/`options.css`) |

### shared/components/

| File                        | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `ConfidenceBadge.ts`        | Reusable confidence score badge with color coding    |
| `LowConfidenceIndicator.ts` | Visual indicators for low-confidence classifications |
| `index.ts`                  | Barrel export for shared components                  |

### shared/styles/

| File             | Description                          |
| ---------------- | ------------------------------------ |
| `confidence.css` | Styles for confidence badges         |
| `indicators.css` | Styles for low-confidence indicators |

---

## Rules

### General Principles

1. **Entry Points**: This layer is the only place that directly interacts with Thunderbird's `messenger` API
2. **Adapter Pattern**: Adapters implement core interfaces (`ITagManager`, `IMailReader`) and delegate to domain/application layer
3. **Dependency Injection**: All components use TSyringe `@injectable()` and `@inject()` decorators
4. **Type Safety**: Declare minimal `messenger` API types locally - do not import external Thunderbird types
5. **Error Handling**: Wrap Thunderbird API calls in try/catch with descriptive error messages via logger

### When Adding New Components

- **UI Components**: Extend `BaseUIComponent` pattern (if exists) or follow existing component structure
- **Adapters**: Implement the corresponding interface from `infrastructure/interfaces/`
- **Event Handlers**: Register/unregister in `start()`/`stop()` methods for proper cleanup

### Code Style

- Use section comments (`// ===`) to organize code blocks
- Include JSDoc comments with `@example` for public methods
- Use type guards for runtime validation (see `isThunderbirdTag()` pattern)

---

## Patterns

### Adapter Pattern

```typescript
@injectable()
export class ThunderbirdTagManager implements ITagManager {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IConfigRepository') private readonly config: IConfigRepository
  ) {}

  async createTag(name: string, color?: string): Promise<ThunderbirdTag> {
    // Bridge to Thunderbird API
    return messenger.messages.tags.create(key, name, color);
  }
}
```

### Message Handler Pattern

```typescript
// In MessageHandler.ts
private handleMessage(message: unknown, sender: unknown, sendResponse: Function): boolean {
  if (isStartBatchAnalysisMessage(message)) {
    this.handleStartBatchAnalysis(message).then(sendResponse);
    return true; // Async response
  }
  return false;
}
```

### UI Component Pattern

```typescript
@injectable()
export class SomeUiComponent {
  private elements: DOMElements | null = null;

  render(): void {
    this.elements = this.getDOMElements();
    this.setupEventListeners();
  }

  async loadSettings(): Promise<void> {
    const config = await this.configRepository.getAppConfig();
    this.updateUI(config);
  }
}
```

---

## Examples

### Adding a New Adapter

1. Define the port in `src/domain/interfaces/` (like `ITagManager`), or in
   `src/infrastructure/interfaces/` for infrastructure-level contracts
2. Create adapter in `interfaces/adapters/ThunderbirdNewAdapter.ts`:

```typescript
@injectable()
export class ThunderbirdNewAdapter implements INewAdapter {
  constructor(@inject('ILogger') private readonly logger: ILogger) {}

  async doSomething(): Promise<void> {
    try {
      await messenger.newApi.method();
    } catch (error) {
      this.logger.error('Failed', { error });
      throw error;
    }
  }
}
```

3. Register in DI container (background script or options entry `options.ts`)
4. Export from `adapters/index.ts`

### Adding a New UI Component

1. Create component in `interfaces/options/NewComponent.ts`:

```typescript
@injectable()
export class NewComponent {
  constructor(
    @inject('ILogger') private readonly logger: ILogger,
    @inject('IConfigRepository') private readonly config: IConfigRepository
  ) {}

  render(): void {
    const container = document.getElementById('new-component-container');
    if (!container) return;
    this.setupEventListeners();
  }

  async refresh(): Promise<void> {
    // Reload data and update UI
  }
}
```

2. Register in DI container: `container.registerSingleton('NewComponent', NewComponent);`
3. Import/register directly from root `options.ts`

### Adding a Runtime Message Handler

1. Define message type and type guard in `MessageHandler.ts`
2. Add handler method following existing patterns
3. Route message in `handleMessage()` switch statement
